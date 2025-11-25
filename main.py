from fastapi import FastAPI, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import pandas as pd
import pyodbc
from datetime import datetime
import numpy as np
import io
import json
from typing import Optional
import asyncio
from contextlib import asynccontextmanager
import logging

app = FastAPI(title="Sistema de Carga de Dados")

# Configuração CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configurações do banco de dados
DB_CONFIG = {
    'server': 'SERVER55\\DW',
    'database': 'Fonte',
    'username': 'servicedw',
    'password': '@aacdservice'
}

# Mapeamento de tabelas
TABELAS_DISPONIVEIS = {
    'AFASTAMENTO': {
        'nome': 'Afastamentos',
        'descricao': 'Dados de afastamentos de funcionários',
        'icone': '🏥'
    },
    'FERIAS': {
        'nome': 'Férias',
        'descricao': 'Registros de férias',
        'icone': '🏖️'
    },
    'MATRICULA': {
        'nome': 'Matrículas',
        'descricao': 'Dados de matrículas de funcionários',
        'icone': '👤'
    },
    'MOVIMENTO_PESSOAL': {
        'nome': 'Movimento Pessoal',
        'descricao': 'Movimentações de pessoal',
        'icone': '📋'
    },
    'MOVIMENTO_PESSOAL_CC': {
        'nome': 'Movimento Pessoal CC',
        'descricao': 'Movimentações de pessoal - Centro de Custo',
        'icone': '💼'
    },
    'ADP_BENEFICIOS': {
        'nome': 'ADP Benefícios',
        'descricao': 'Dados de benefícios ADP',
        'icone': '🎁'
    },
    'ADP_MOTIVO_RESCISAO': {
        'nome': 'ADP Motivo Rescisão',
        'descricao': 'Motivos de rescisão ADP',
        'icone': '📄'
    }
}

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def send_progress(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except:
            pass

manager = ConnectionManager()

# Logger para depuração de leitura de arquivos Excel
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
if not logger.handlers:
    fh = logging.FileHandler('read_excel_debug.log', encoding='utf-8')
    formatter = logging.Formatter('%(asctime)s - %(levelname)s - %(name)s - %(message)s')
    fh.setFormatter(formatter)
    logger.addHandler(fh)

def get_connection_string():
    return (
        f"DRIVER={{ODBC Driver 17 for SQL Server}};"
        f"SERVER={DB_CONFIG['server']};"
        f"DATABASE={DB_CONFIG['database']};"
        f"UID={DB_CONFIG['username']};"
        f"PWD={DB_CONFIG['password']}"
    )

def is_valid_sql_date(dt):
    if pd.isnull(dt):
        return True
    try:
        if isinstance(dt, str):
            dt = pd.to_datetime(dt)
        return pd.Timestamp('1753-01-01') <= dt <= pd.Timestamp('9999-12-31')
    except:
        return False

def get_column_info(cursor, table_name):
    column_info = {}
    cursor.execute(f"""
        SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = '{table_name}'
    """)
    for row in cursor.fetchall():
        column_info[row[0]] = {
            'type': row[1],
            'max_length': row[2],
            'is_nullable': row[3] == 'YES'
        }
    return column_info

def convert_column_type(df, col_name, sql_type, is_nullable=True):
    df[col_name] = df[col_name].replace({pd.NaT: None, np.nan: None, '': None, 'NaT': None, 'NaN': None})
    
    if sql_type == 'int':
        df[col_name] = df[col_name].apply(lambda x: str(x).strip().replace(',', '') if pd.notnull(x) else None)
        df[col_name] = pd.to_numeric(df[col_name], errors='coerce')
        if not is_nullable:
            df[col_name] = df[col_name].fillna(0)
        df.loc[df[col_name].notna(), col_name] = df.loc[df[col_name].notna(), col_name].astype(np.int64)
    
    elif sql_type in ['datetime', 'datetime2']:
        df[col_name] = pd.to_datetime(df[col_name], errors='coerce', dayfirst=True, format='mixed')
        df[col_name] = df[col_name].apply(lambda x: x.to_pydatetime() if pd.notnull(x) and is_valid_sql_date(x) else None)
    
    elif sql_type == 'varchar' or sql_type == 'nvarchar':
        df[col_name] = df[col_name].apply(lambda x: str(x).strip() if pd.notnull(x) else None)

async def processar_arquivo(file_content: bytes, tabela: str, websocket: WebSocket, tipo_carga: str = 'completa'):
    try:

        await manager.send_progress({
            'status': 'reading',
            'message': 'Lendo arquivo...',
            'progress': 10
        }, websocket)

        # Detecta se é .xls pelo header (D0 CF 11 E0) ou .xlsx (PK\x03\x04)
        header = file_content[:8]
        is_xls = header[:4] == b'\xD0\xCF\x11\xE0'
        is_xlsx = header[:2] == b'PK'

        file_buf = io.BytesIO(file_content)
        df = None
        last_exc = None

        if is_xls:
            await manager.send_progress({
                'status': 'converting',
                'message': 'Detectado .xls: tentando leitura binária com xlrd...',
                'progress': 15
            }, websocket)

            # Primeiro tenta ler com xlrd (o backend mais apropriado para .xls)
            try:
                file_buf.seek(0)
                df = pd.read_excel(file_buf, engine='xlrd')
                await manager.send_progress({
                    'status': 'converting',
                    'message': 'Arquivo .xls lido como Excel binário (xlrd). Salvando como .xlsx em memória...',
                    'progress': 17
                }, websocket)
            except Exception as e:
                last_exc = e
                logger.exception('Falha ao ler .xls com xlrd')
                try:
                    await manager.send_progress({
                        'status': 'debug',
                        'message': f'Falha ao ler .xls com xlrd: {type(e).__name__}: {str(e)}',
                        'progress': 16
                    }, websocket)
                except Exception:
                    pass
                # Se falhar como binário, tenta como texto/tabulado (alguns .xls são CSV disfarçados)
                for enc in ('latin1', 'utf-8', 'cp1252'):
                    try:
                        file_buf.seek(0)
                        df = pd.read_csv(file_buf, sep='\t', encoding=enc)
                        await manager.send_progress({
                            'status': 'converting',
                            'message': f'Arquivo .xls lido como texto/tabulado (encoding={enc}). Salvando como .xlsx em memória...',
                            'progress': 17
                        }, websocket)
                        last_exc = None
                        break
                    except Exception as e2:
                        last_exc = e2
                        logger.exception(f'Falha ao ler .xls como texto com encoding={enc}')
                        try:
                            await manager.send_progress({
                                'status': 'debug',
                                'message': f'Falha ao ler .xls como texto (encoding={enc}): {type(e2).__name__}: {str(e2)}',
                                'progress': 16
                            }, websocket)
                        except Exception:
                            pass

            if df is None:
                await manager.send_progress({
                    'status': 'error',
                    'message': f'Erro ao ler arquivo .xls: {str(last_exc)}',
                    'progress': 0
                }, websocket)
                raise last_exc

            # Salva em memória como .xlsx e relê com openpyxl para padronizar
            xlsx_buffer = io.BytesIO()
            df.to_excel(xlsx_buffer, index=False, engine='openpyxl')
            xlsx_buffer.seek(0)
            await manager.send_progress({
                'status': 'converting',
                'message': 'Conversão concluída, lendo .xlsx...',
                'progress': 18
            }, websocket)
            df = pd.read_excel(xlsx_buffer, engine='openpyxl')
        else:
            # Para arquivos não .xls detectados pelo header, tenta múltiplos métodos
            # Primeiro tenta como Excel com múltiplos engines
            for eng in (None, 'openpyxl', 'xlrd'):
                try:
                    file_buf.seek(0)
                    if eng is None:
                        df = pd.read_excel(file_buf)
                    else:
                        df = pd.read_excel(file_buf, engine=eng)
                    break
                except Exception as e:
                    last_exc = e
                    logger.exception(f'Falha ao ler Excel com engine={eng}')
                    try:
                        await manager.send_progress({
                            'status': 'debug',
                            'message': f'Falha ao ler Excel com engine={eng}: {type(e).__name__}: {str(e)}',
                            'progress': 10
                        }, websocket)
                    except Exception:
                        pass
            
            # Se todos os engines falharam, tenta como CSV/texto (arquivo pode estar mal-nomeado)
            if df is None:
                logger.info('Tentando ler como CSV/texto após falha dos engines Excel')
                for enc in ('latin1', 'utf-8', 'cp1252'):
                    try:
                        file_buf.seek(0)
                        df = pd.read_csv(file_buf, sep='\t', encoding=enc)
                        await manager.send_progress({
                            'status': 'converting',
                            'message': f'Arquivo lido como texto/tabulado (encoding={enc}).',
                            'progress': 17
                        }, websocket)
                        last_exc = None
                        break
                    except Exception as e2:
                        last_exc = e2

            if df is None:
                await manager.send_progress({
                    'status': 'error',
                    'message': f'Erro ao ler arquivo Excel: {str(last_exc)}',
                    'progress': 0
                }, websocket)
                raise last_exc
        total_linhas = len(df)
        
        await manager.send_progress({
            'status': 'processing',
            'message': f'{total_linhas} linhas lidas',
            'progress': 20,
            'total_rows': total_linhas
        }, websocket)
        
        # Remove colunas vazias
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
        df.columns = df.columns.str.strip()
        
        # Normaliza nome da coluna para MOVIMENTO_PESSOAL_CC
        if tabela == "MOVIMENTO_PESSOAL_CC":
            for col in df.columns:
                if col.strip().lower() in ["data de vigência", "data de vigencia"]:
                    df.rename(columns={col: "Data de Vigência"}, inplace=True)
        
        await manager.send_progress({
            'status': 'connecting',
            'message': 'Conectando ao banco de dados...',
            'progress': 30
        }, websocket)
        
        # Conecta ao banco
        conn = pyodbc.connect(get_connection_string())
        cursor = conn.cursor()
        
        # Obtém informações das colunas
        column_info = get_column_info(cursor, tabela)
        
        # Limpa a tabela apenas se for carga completa
        if tipo_carga == 'completa':
            await manager.send_progress({
                'status': 'cleaning',
                'message': 'Limpando tabela (carga completa)...',
                'progress': 40
            }, websocket)
            
            cursor.execute(f'DELETE FROM dbo.{tabela}')
            conn.commit()
        else:
            await manager.send_progress({
                'status': 'info',
                'message': 'Carga incremental - mantendo dados existentes...',
                'progress': 40
            }, websocket)
        
        await manager.send_progress({
            'status': 'converting',
            'message': 'Convertendo tipos de dados...',
            'progress': 50
        }, websocket)
        
        # Converte colunas
        for col in df.columns:
            if col in column_info:
                convert_column_type(df, col, column_info[col]['type'], column_info[col]['is_nullable'])
        
        # Remove linhas completamente vazias
        df = df.dropna(how='all')
        
        if not df.empty:
            # Prepara dados para inserção
            cols = ','.join(f'[{c}]' for c in df.columns)
            placeholders = ','.join(['?'] * len(df.columns))
            insert_sql = f'INSERT INTO dbo.{tabela} ({cols}) VALUES ({placeholders})'
            
            data = []
            for row in df.values:
                converted_row = []
                for value, (col_name, col_info) in zip(row, column_info.items()):
                    if pd.isnull(value):
                        converted_row.append(None)
                    else:
                        if col_info['type'] == 'int':
                            try:
                                converted_row.append(int(value))
                            except:
                                converted_row.append(None)
                        elif col_info['type'] in ['datetime', 'datetime2']:
                            if isinstance(value, datetime):
                                converted_row.append(value)
                            else:
                                try:
                                    dt = pd.to_datetime(value, errors='coerce', dayfirst=True)
                                    if pd.isnull(dt):
                                        converted_row.append(None)
                                    else:
                                        converted_row.append(dt.to_pydatetime())
                                except:
                                    converted_row.append(None)
                        else:
                            converted_row.append(str(value).strip())
                data.append(tuple(converted_row))
            
            # Insere em lotes
            batch_size = 1000
            total_batches = (len(data) + batch_size - 1) // batch_size
            
            for i in range(0, len(data), batch_size):
                batch = data[i:i + batch_size]
                batch_num = (i // batch_size) + 1
                
                try:
                    cursor.fast_executemany = True
                    cursor.executemany(insert_sql, batch)
                    conn.commit()
                    
                    progress = 50 + int((batch_num / total_batches) * 40)
                    await manager.send_progress({
                        'status': 'inserting',
                        'message': f'Inserindo lote {batch_num} de {total_batches}',
                        'progress': progress,
                        'inserted_rows': min(i + batch_size, len(data))
                    }, websocket)
                    
                except Exception as e:
                    await manager.send_progress({
                        'status': 'error',
                        'message': f'Erro ao inserir dados: {str(e)}',
                        'progress': 0
                    }, websocket)
                    raise
            
            # Verifica total inserido
            cursor.execute(f'SELECT COUNT(*) FROM dbo.{tabela}')
            count = cursor.fetchone()[0]
            
            conn.close()
            
            tipo_msg = 'Carga completa' if tipo_carga == 'completa' else 'Carga incremental'
            await manager.send_progress({
                'status': 'success',
                'message': f'{tipo_msg} concluída! {count} registros na tabela.',
                'progress': 100,
                'total_inserted': count
            }, websocket)
            
        else:
            conn.close()
            await manager.send_progress({
                'status': 'warning',
                'message': 'Arquivo vazio, nenhum registro inserido.',
                'progress': 100
            }, websocket)
            
    except Exception as e:
        await manager.send_progress({
            'status': 'error',
            'message': f'Erro: {str(e)}',
            'progress': 0
        }, websocket)
        raise

@app.get("/api/tabelas")
async def listar_tabelas():
    """Retorna lista de tabelas disponíveis"""
    return {"tabelas": TABELAS_DISPONIVEIS}

@app.get("/api/tabelas/{tabela}/info")
async def info_tabela(tabela: str):
    """Retorna informações sobre uma tabela específica"""
    if tabela not in TABELAS_DISPONIVEIS:
        raise HTTPException(status_code=404, detail="Tabela não encontrada")
    
    try:
        conn = pyodbc.connect(get_connection_string())
        cursor = conn.cursor()
        
        # Conta registros
        cursor.execute(f'SELECT COUNT(*) FROM dbo.{tabela}')
        count = cursor.fetchone()[0]
        
        # Pega última atualização (se houver coluna de data)
        try:
            cursor.execute(f'SELECT MAX(CAST([Data de Vigência] as datetime)) FROM dbo.{tabela}')
            last_update = cursor.fetchone()[0]
        except:
            last_update = None
        
        conn.close()
        
        return {
            "tabela": tabela,
            "info": TABELAS_DISPONIVEIS[tabela],
            "total_registros": count,
            "ultima_atualizacao": last_update.isoformat() if last_update else None
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.websocket("/ws/upload/{tabela}")
async def websocket_upload(websocket: WebSocket, tabela: str, tipo_carga: str = 'completa'):
    """WebSocket para upload com progresso em tempo real"""
    if tabela not in TABELAS_DISPONIVEIS:
        await websocket.close(code=1008)
        return
    
    await manager.connect(websocket)
    try:
        # Recebe o arquivo
        data = await websocket.receive_bytes()
        
        # Processa o arquivo
        await processar_arquivo(data, tabela, websocket, tipo_carga)
        
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        await manager.send_progress({
            'status': 'error',
            'message': f'Erro: {str(e)}',
            'progress': 0
        }, websocket)
    finally:
        manager.disconnect(websocket)

@app.get("/api/tabelas/{tabela}/modelo")
async def download_modelo(tabela: str):
    """Gera e retorna um arquivo Excel modelo com as colunas da tabela"""
    if tabela not in TABELAS_DISPONIVEIS:
        raise HTTPException(status_code=404, detail="Tabela não encontrada")
    
    try:
        conn = pyodbc.connect(get_connection_string())
        cursor = conn.cursor()
        
        # Obtém informações das colunas
        column_info = get_column_info(cursor, tabela)
        conn.close()
        
        # Cria DataFrame vazio com as colunas
        df = pd.DataFrame(columns=list(column_info.keys()))
        
        # Gera arquivo Excel em memória
        output = io.BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        from fastapi.responses import StreamingResponse
        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={'Content-Disposition': f'attachment; filename="modelo_{tabela}.xlsx"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health_check():
    """Verifica saúde da aplicação e conexão com banco"""
    try:
        conn = pyodbc.connect(get_connection_string())
        conn.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}

# ========================================
# ROTAS PARA TABELA TEMPORÁRIA (EXCEL CUSTOMIZADO)
# ========================================

@app.post("/api/analyze-excel")
async def analyze_excel(file: UploadFile = File(...)):
    """Analisa um arquivo Excel e retorna informações sobre colunas e tipos de dados"""
    try:
        contents = await file.read()
        file_buf = io.BytesIO(contents)
        
        # Tenta ler o arquivo
        try:
            df = pd.read_excel(file_buf, engine='openpyxl')
        except:
            try:
                file_buf.seek(0)
                df = pd.read_excel(file_buf, engine='xlrd')
            except:
                raise HTTPException(status_code=400, detail="Não foi possível ler o arquivo Excel")
        
        if df.empty:
            raise HTTPException(status_code=400, detail="O arquivo Excel está vazio")
        
        # Analisa as colunas
        columns_info = []
        for col in df.columns:
            # Detecta o tipo de dado
            sample_values = df[col].dropna().head(10).tolist()
            dtype = str(df[col].dtype)
            
            # Inferir tipo SQL
            sql_type = "NVARCHAR(255)"
            if 'int' in dtype:
                sql_type = "INT"
            elif 'float' in dtype:
                sql_type = "FLOAT"
            elif 'datetime' in dtype or 'date' in dtype:
                sql_type = "DATETIME"
            elif 'bool' in dtype:
                sql_type = "BIT"
            else:
                # Para strings, tenta detectar o tamanho máximo
                max_len = df[col].astype(str).str.len().max()
                if pd.notna(max_len) and max_len > 0:
                    sql_type = f"NVARCHAR({min(int(max_len * 1.5), 4000)})"
            
            columns_info.append({
                "name": str(col),
                "pandas_type": dtype,
                "sql_type": sql_type,
                "sample_values": [str(v) for v in sample_values[:3]],
                "null_count": int(df[col].isnull().sum()),
                "total_count": len(df)
            })
        
        return {
            "success": True,
            "filename": file.filename,
            "rows": len(df),
            "columns": columns_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao analisar Excel")
        raise HTTPException(status_code=500, detail=f"Erro ao analisar arquivo: {str(e)}")

@app.post("/api/load-custom-excel")
async def load_custom_excel(
    file: UploadFile = File(...),
    table_name: str = None,
    columns_config: str = None
):
    """Carrega um Excel customizado em uma tabela temporária"""
    try:
        if not table_name:
            raise HTTPException(status_code=400, detail="Nome da tabela é obrigatório")
        
        # Valida nome da tabela (previne SQL injection)
        if not table_name.replace('_', '').isalnum():
            raise HTTPException(status_code=400, detail="Nome da tabela deve conter apenas letras, números e underscore")
        
        # Garante que é uma tabela temporária
        if not table_name.startswith('TEMP_'):
            table_name = f"TEMP_{table_name}"
        
        contents = await file.read()
        file_buf = io.BytesIO(contents)
        
        # Lê o arquivo
        try:
            df = pd.read_excel(file_buf, engine='openpyxl')
        except:
            try:
                file_buf.seek(0)
                df = pd.read_excel(file_buf, engine='xlrd')
            except:
                raise HTTPException(status_code=400, detail="Não foi possível ler o arquivo Excel")
        
        if df.empty:
            raise HTTPException(status_code=400, detail="O arquivo Excel está vazio")
        
        # Parse da configuração de colunas (se fornecida)
        columns_map = {}
        if columns_config:
            import json
            columns_map = json.loads(columns_config)
        
        # Conecta ao banco
        conn_str = get_connection_string()
        conn = pyodbc.connect(conn_str)
        cursor = conn.cursor()
        
        try:
            # Verifica se a tabela já existe e deleta
            cursor.execute(f"""
                IF OBJECT_ID('dbo.{table_name}', 'U') IS NOT NULL
                    DROP TABLE dbo.{table_name}
            """)
            conn.commit()
            
            # Cria a estrutura da tabela baseado nas colunas
            create_columns = []
            for col in df.columns:
                col_name = str(col).strip().replace(' ', '_').replace('-', '_')
                sql_type = columns_map.get(col, "NVARCHAR(255)")
                create_columns.append(f"[{col_name}] {sql_type} NULL")
            
            create_table_sql = f"""
                CREATE TABLE dbo.{table_name} (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    {', '.join(create_columns)},
                    DataCarga DATETIME DEFAULT GETDATE()
                )
            """
            
            cursor.execute(create_table_sql)
            conn.commit()
            
            # Renomeia colunas do DataFrame
            df.columns = [str(col).strip().replace(' ', '_').replace('-', '_') for col in df.columns]
            
            # Insere os dados em lotes
            batch_size = 1000
            total_rows = len(df)
            inserted = 0
            
            for start_idx in range(0, total_rows, batch_size):
                end_idx = min(start_idx + batch_size, total_rows)
                batch_df = df.iloc[start_idx:end_idx]
                
                for _, row in batch_df.iterrows():
                    cols = ', '.join([f'[{col}]' for col in batch_df.columns])
                    placeholders = ', '.join(['?' for _ in batch_df.columns])
                    insert_sql = f"INSERT INTO dbo.{table_name} ({cols}) VALUES ({placeholders})"
                    
                    values = []
                    for col in batch_df.columns:
                        val = row[col]
                        if pd.isna(val):
                            values.append(None)
                        else:
                            values.append(val)
                    
                    cursor.execute(insert_sql, values)
                    inserted += 1
                
                conn.commit()
            
            cursor.close()
            conn.close()
            
            return {
                "success": True,
                "message": f"Dados carregados com sucesso na tabela {table_name}",
                "table_name": table_name,
                "rows_inserted": inserted
            }
            
        except Exception as e:
            conn.rollback()
            cursor.close()
            conn.close()
            raise HTTPException(status_code=500, detail=f"Erro ao criar/carregar tabela: {str(e)}")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Erro ao carregar Excel customizado")
        raise HTTPException(status_code=500, detail=f"Erro ao processar arquivo: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
