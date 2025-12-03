import pandas as pd
import pyodbc
from datetime import datetime
import numpy as np
import os

# Configurações de conexão - ajuste conforme necessário
server = 'SERVER55\\DW'  # Exemplo: 'localhost' ou '192.168.1.100'
database = 'Fonte'   # Exemplo: 'MeuBanco'
username = 'servicedw' # Exemplo: 'sa'
password = '@aacdservice'   # Exemplo: 'minhasenha'

# String de conexão para SQL Server
conn_str = (
    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
    f"SERVER={server};DATABASE={database};UID={username};PWD={password}"
)

# Mapeamento de arquivos para tabelas
arquivos_tabelas = {
    'AFASTAMENTO.xlsx': 'AFASTAMENTO',
    'FERIAS.xlsx': 'FERIAS',
    'MATRICULA.xlsx': 'MATRICULA',
    'MOVIMENTO_PESSOAL.xlsx': 'MOVIMENTO_PESSOAL',
    'MOVIMENTO_PESSOAL_CC.xlsx': 'MOVIMENTO_PESSOAL_CC',
    'ADP_BENEFICIOS.xlsx': 'ADP_BENEFICIOS',
    'ADP_MOTIVO_RESCISAO.xlsx': 'ADP_MOTIVO_RESCISAO',
    'CARGOS_CBO.xlsx': 'ADP_CARGOS_CBO'
}

def converter_xls_para_xlsx(nome_base):
    """Converte arquivo .xls para .xlsx se necessário"""
    arquivo_xls = f'{nome_base}.xls'
    arquivo_xlsx = f'{nome_base}.xlsx'
    
    # Se já existe .xlsx, não precisa converter
    if os.path.exists(arquivo_xlsx):
        return arquivo_xlsx, False  # False = não foi convertido agora
    
    # Se existe .xls, converte para .xlsx
    if os.path.exists(arquivo_xls):
        print(f'Convertendo {arquivo_xls} para {arquivo_xlsx}...')
        try:
            df = pd.read_csv(arquivo_xls, sep='\t', encoding='latin1')
            df.to_excel(arquivo_xlsx, index=False, engine='openpyxl')
            print(f'Conversão concluída: {arquivo_xlsx}')
            return arquivo_xlsx, True  # True = foi convertido agora
        except Exception as e:
            print(f'Erro ao converter {arquivo_xls}: {str(e)}')
            return None, False
    
    return None, False

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
    # Obtém informações sobre as colunas da tabela
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
    try:
        print(f"Convertendo coluna {col_name} para {sql_type}")
        
        # Primeiro converte valores problemáticos para None
        df[col_name] = df[col_name].replace({pd.NaT: None, np.nan: None, '': None, 'NaT': None, 'NaN': None})
        
        if sql_type == 'int':
            # Remove qualquer caractere não numérico
            df[col_name] = df[col_name].apply(lambda x: str(x).strip().replace(',', '') if pd.notnull(x) else None)
            # Converte para float primeiro para lidar com NaN, depois para int
            df[col_name] = pd.to_numeric(df[col_name], errors='coerce')
            if not is_nullable:
                df[col_name] = df[col_name].fillna(0)
            # Converte para int64 apenas os valores não nulos
            df.loc[df[col_name].notna(), col_name] = df.loc[df[col_name].notna(), col_name].astype(np.int64)
        
        elif sql_type in ['datetime', 'datetime2']:
            df[col_name] = pd.to_datetime(df[col_name], errors='coerce', dayfirst=True)
            df[col_name] = df[col_name].apply(lambda x: x.to_pydatetime() if pd.notnull(x) and is_valid_sql_date(x) else None)
        
        elif sql_type == 'varchar' or sql_type == 'nvarchar':
            # Converte apenas valores não nulos para string
            df[col_name] = df[col_name].apply(lambda x: str(x).strip() if pd.notnull(x) else None)
            
        # Verifica valores após a conversão
        null_count = df[col_name].isna().sum()
        total_count = len(df)
        print(f"Coluna {col_name}: {total_count - null_count} valores válidos, {null_count} valores nulos")
        
        if not df[col_name].isna().all():  # Se tiver algum valor não nulo
            print(f"Exemplo de valor não nulo: {df[col_name][df[col_name].notna()].iloc[0]}")
            print(f"Tipo dos dados: {df[col_name].dtype}")
            
    except Exception as e:
        print(f"Erro ao converter coluna {col_name} para {sql_type}: {str(e)}")
        raise

# Lista para rastrear arquivos convertidos que devem ser removidos
arquivos_convertidos = []

with pyodbc.connect(conn_str) as conn:
    cursor = conn.cursor()
    print(f'Conectado ao banco: {database} no servidor: {server}')
    
    for arquivo, tabela in arquivos_tabelas.items():
        # Remove extensão do nome base
        nome_base = arquivo.replace('.xlsx', '')
        
        # Converte .xls para .xlsx se necessário
        arquivo_final, foi_convertido = converter_xls_para_xlsx(nome_base)
        
        if arquivo_final is None:
            print(f'\n[AVISO] Arquivo não encontrado para tabela {tabela}')
            continue
        
        # Adiciona à lista de arquivos para remover depois
        if foi_convertido:
            arquivos_convertidos.append(arquivo_final)
        
        print(f'\nProcessando tabela {tabela}...')
        tabela_full = f'dbo.{tabela}'
        
        # Obtém informações sobre as colunas
        column_info = get_column_info(cursor, tabela)
        print("\nEstrutura da tabela:")
        for col, info in column_info.items():
            print(f"Coluna: {col}, Tipo: {info['type']}, Tamanho máximo: {info['max_length']}, Nullable: {info['is_nullable']}")
        
        print(f'\nLimpando tabela {tabela_full}...')
        cursor.execute(f'DELETE FROM {tabela_full}')
        conn.commit()
        
        # Lê o arquivo Excel
        df = pd.read_excel(arquivo_final)
        print(f'{len(df)} linhas lidas de {arquivo_final}')
        
        # Remove colunas vazias (como "Unnamed: X")
        df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
        
        # Remove espaços extras dos nomes das colunas
        df.columns = df.columns.str.strip()
        
        print(f'Colunas após limpeza: {list(df.columns)}')
        
        # --- NOVO: Normaliza o nome da coluna "Data de Vigência" ---
        if tabela == "MOVIMENTO_PESSOAL_CC":
            # Corrige possíveis variações de nome
            for col in df.columns:
                if col.strip().lower() in ["data de vigência", "data de vigencia"]:
                    df.rename(columns={col: "Data de Vigência"}, inplace=True)
        
        # Remove colunas ID e DataCarga se existirem no DataFrame (serão geradas pelo banco)
        colunas_remover = ['ID', 'DataCarga']
        for col in colunas_remover:
            if col in df.columns:
                df = df.drop(columns=[col])
                print(f'Coluna {col} removida do DataFrame (será gerada automaticamente)')
        
        # Converte as colunas para os tipos corretos
        for col in df.columns:
            if col in column_info:
                convert_column_type(df, col, column_info[col]['type'], column_info[col]['is_nullable'])
        
        if not df.empty:
            # Remove linhas onde todas as colunas são NULL
            df = df.dropna(how='all')
            
            # Prepara a query de inserção (exclui ID e DataCarga)
            colunas_insert = [c for c in df.columns if c not in ['ID', 'DataCarga']]
            cols = ','.join(f'[{c}]' for c in colunas_insert)
            placeholders = ','.join(['?'] * len(colunas_insert))
            
            # Adiciona DataCarga com valor DEFAULT (GETDATE())
            insert_sql = f'INSERT INTO {tabela_full} ({cols}, [DataCarga]) VALUES ({placeholders}, GETDATE())'
            
            # Converte para lista de tuplas e insere no banco
            data = []
            for row in df.values:
                converted_row = []
                for value, col_name in zip(row, df.columns):
                    if col_name not in column_info:
                        continue
                    col_info = column_info[col_name]
                    if pd.isnull(value):
                        converted_row.append(None)
                    else:
                        if col_info['type'] == 'int':
                            try:
                                converted_row.append(int(value))
                            except:
                                converted_row.append(None)
                        elif col_info['type'] in ['datetime', 'datetime2']:
                            # --- GARANTE QUE O VALOR É DATETIME ---
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
                        else:  # varchar/nvarchar
                            converted_row.append(str(value).strip())
                data.append(tuple(converted_row))
            
            # Divide em lotes de 1000 registros para evitar problemas com grandes volumes
            batch_size = 1000
            for i in range(0, len(data), batch_size):
                batch = data[i:i + batch_size]
                try:
                    cursor.fast_executemany = True
                    cursor.executemany(insert_sql, batch)
                    conn.commit()
                    print(f'Inserido lote de {len(batch)} registros na tabela {tabela_full}')
                except Exception as e:
                    print(f'\nErro ao inserir lote na tabela {tabela_full}: {str(e)}')
                    print("\nTentando inserir registro por registro para identificar o problema...")
                    # Tenta inserir registro por registro para identificar problemas
                    for j, row in enumerate(batch):
                        try:
                            cursor.execute(insert_sql, row)
                            conn.commit()
                        except Exception as row_error:
                            print(f'\nErro ao inserir registro {i + j}: {str(row_error)}')
                            print('Dados do registro com erro:')
                            for col_name, value in zip(df.columns, row):
                                print(f"{col_name}: '{value}' (tipo: {type(value)})")
                    continue
            
            print(f'\n{len(df)} linhas processadas na tabela {tabela_full}!')
        else:
            print(f'\nArquivo {arquivo} está vazio, nada inserido.')
        
        cursor.execute(f'SELECT COUNT(*) FROM {tabela_full}')
        count = cursor.fetchone()[0]
        print(f'Tabela {tabela_full} agora possui {count} linhas no banco.')

# Remove arquivos convertidos
if arquivos_convertidos:
    print('\nRemovendo arquivos convertidos...')
    for arquivo in arquivos_convertidos:
        try:
            os.remove(arquivo)
            print(f'Removido: {arquivo}')
        except Exception as e:
            print(f'Erro ao remover {arquivo}: {str(e)}')

print('\nProcesso concluído.')
