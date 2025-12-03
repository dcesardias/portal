# Correção: Interpretação de Datas Brasileiras no Sistema de Carga

## 🐛 Problema Identificado

O sistema estava interpretando datas em formato brasileiro (DD/MM/YYYY) como formato americano (MM/DD/YYYY).

**Exemplo do erro:**
- **Excel (string):** `03/07/2023`
- **Gravado no banco:** `2023-06-03` ❌ (interpretou como 3 de junho)
- **Deveria gravar:** `2023-07-03` ✅ (3 de julho)

## 🔍 Causa Raiz

No arquivo `server.js`, a biblioteca XLSX estava sendo usada com configurações que não respeitavam o formato brasileiro de datas:

```javascript
// ANTES (ERRADO):
const dataText = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false,
    dateNF: 'dd/mm/yyyy'  // ❌ Isso apenas formata a SAÍDA, não o PARSING!
});
```

O parâmetro `dateNF` apenas define o formato de saída quando se converte uma data para string, mas **não afeta como a biblioteca interpreta datas** que já estão como texto no Excel.

## ✅ Solução Implementada

### 1. **Endpoint `/api/excel/upload/:tabela`** (linha 575)

Removemos configurações que interferiam no parsing de datas:

```javascript
// DEPOIS (CORRETO):
const workbook = XLSX.readFile(req.file.path, { 
    cellText: false,   // Não força conversão de células
    cellDates: false   // Não força conversão automática de datas
});

const dataText = XLSX.utils.sheet_to_json(worksheet, {
    defval: null,
    raw: false  // Lê dados como estão formatados no Excel
});
```

### 2. **Endpoint `/api/excel/upload-temp`** (linha 803)

Mudamos de `raw: true` para `raw: false`:

```javascript
// ANTES:
const rawData = XLSX.utils.sheet_to_json(worksheet, { 
    defval: null, 
    raw: true  // ❌ Lê valores brutos (números seriais do Excel)
});

// DEPOIS:
const rawData = XLSX.utils.sheet_to_json(worksheet, { 
    defval: null, 
    raw: false  // ✅ Lê valores formatados (strings no formato do Excel)
});
```

### 3. **Função `convertToSqlType` já estava correta!**

A função já processava corretamente datas brasileiras (linha 454-480):

```javascript
// Reconhece formato DD/MM/YYYY
const brDateMatch = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
if (brDateMatch) {
    const [, day, month, year] = brDateMatch;
    const dayNum = parseInt(day);
    const monthNum = parseInt(month);
    // ... validação e criação da data correta
}
```

## 📊 Comparação com CARGA.py

O script Python `CARGA.py` **nunca teve esse problema** porque usa o parâmetro correto:

```python
# Linha 107 do CARGA.py:
df[col_name] = pd.to_datetime(df[col_name], errors='coerce', dayfirst=True)
                                                             ^^^^^^^^^^^^^^
                                                             Força formato brasileiro!
```

O pandas tem um parâmetro explícito `dayfirst=True` que força a interpretação de datas no formato DD/MM/YYYY.

## 🎯 Resultado

Agora o sistema processa datas brasileiras corretamente:

| Formato Excel | Interpretação | Data SQL |
|--------------|---------------|----------|
| `03/07/2023` | 3 de julho de 2023 | `2023-07-03` ✅ |
| `15/12/2024` | 15 de dezembro de 2024 | `2024-12-15` ✅ |
| `01/01/2025` | 1 de janeiro de 2025 | `2025-01-01` ✅ |

## 🧪 Como Testar

1. Crie um arquivo Excel com uma coluna de data
2. Preencha com datas no formato `DD/MM/YYYY` (ex: `03/07/2023`)
3. Faça o upload pelo sistema de carga
4. Verifique no banco de dados que a data foi gravada como `2023-07-03`

## 📝 Notas Técnicas

- A mudança **não afeta** a leitura de arquivos para detecção de tipos de colunas (endpoints de administração)
- A mudança **não afeta** datas que já estão armazenadas como números seriais do Excel (células formatadas como data no Excel)
- A correção garante compatibilidade com o padrão brasileiro (DD/MM/YYYY)
- O sistema agora está alinhado com o comportamento do script Python `CARGA.py`

---

**Data da correção:** 03/12/2025  
**Arquivos alterados:** `server.js` (linhas 575, 803)
