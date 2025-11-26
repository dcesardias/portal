# Sistema de Cadastro de Grupos e Tabelas - Excel

## 📋 Visão Geral

Este sistema permite cadastrar e gerenciar grupos e tabelas dinamicamente para o sistema de carga Excel. As definições são armazenadas no banco de dados PowerBIPortal.

## 🗄️ Estrutura do Banco de Dados

### Tabelas Criadas

1. **TableGroups** - Grupos de tabelas
   - `Id` - Identificador único
   - `Code` - Código do grupo (único, ex: ADP, RH, FINANCEIRO)
   - `Name` - Nome do grupo
   - `Description` - Descrição do grupo
   - `Icon` - Ícone emoji do grupo
   - `IsActive` - Status (soft delete)
   - `CreatedAt` / `UpdatedAt` - Timestamps

2. **TableDefinitions** - Definições de tabelas
   - `Id` - Identificador único
   - `TableName` - Nome da tabela no banco (único)
   - `DisplayName` - Nome de exibição
   - `Description` - Descrição da tabela
   - `Icon` - Ícone emoji
   - `GroupId` - Referência ao grupo (opcional)
   - `ModelFileName` - Nome do arquivo modelo Excel
   - `ModelFilePath` - Caminho do arquivo modelo
   - `ColumnDefinitions` - JSON com definição das colunas
   - `IsActive` - Status (soft delete)
   - `CreatedAt` / `UpdatedAt` - Timestamps

## 🚀 Instalação

### 1. Executar Scripts SQL

Execute os scripts na seguinte ordem no SQL Server (banco PowerBIPortal):

```bash
# 1. Criar estrutura das tabelas
.\database\01_create_tables.sql

# 2. Inserir dados do grupo ADP existente
.\database\02_insert_adp_data.sql
```

### 2. Verificar Instalação

Execute no SQL Server Management Studio:

```sql
USE PowerBIPortal;

-- Verificar grupos
SELECT * FROM TableGroups WHERE IsActive = 1;

-- Verificar tabelas
SELECT t.*, g.Name as GroupName 
FROM TableDefinitions t
LEFT JOIN TableGroups g ON t.GroupId = g.Id
WHERE t.IsActive = 1;
```

## 🎯 Como Usar

### Acessar Interface Administrativa

1. Faça login no portal como administrador
2. Acesse: `http://seu-servidor/excel/admin`

### Cadastrar um Novo Grupo

1. Clique em "Novo Grupo"
2. Preencha:
   - **Código**: Identificador único (ex: RH, FINANCEIRO) - apenas maiúsculas, números e underline
   - **Nome**: Nome de exibição (ex: Recursos Humanos)
   - **Descrição**: Descrição do grupo
   - **Ícone**: Emoji (ex: 👥, 💰, 📊)
3. Clique em "Salvar"

### Cadastrar uma Nova Tabela

1. Clique em "Nova Tabela"
2. Preencha:
   - **Nome da Tabela (SQL)**: Nome real da tabela no banco (ex: FUNCIONARIOS) - apenas maiúsculas, números e underline
   - **Nome de Exibição**: Nome amigável (ex: Funcionários)
   - **Descrição**: Descrição da tabela
   - **Ícone**: Emoji (ex: 👤, 📋, 📄)
   - **Grupo**: Selecione o grupo (opcional)
   - **Arquivo Modelo**: Faça upload de um Excel modelo com as colunas da tabela
3. Clique em "Salvar"

#### ⚠️ Importante sobre o Arquivo Modelo

- O arquivo Excel modelo é usado para:
  - Gerar o modelo de download para o usuário
  - Extrair automaticamente as colunas da tabela
  - Validar a estrutura na hora do upload
- A primeira linha do Excel deve conter os nomes das colunas
- As colunas devem corresponder exatamente aos campos da tabela no banco de dados

### Editar Grupo ou Tabela

1. Clique no botão "Editar" na linha desejada
2. Modifique os campos necessários
3. Clique em "Salvar"

**Nota:** Não é possível editar o código do grupo ou o nome da tabela após criação.

### Excluir Grupo ou Tabela

1. Clique no botão "Excluir"
2. Confirme a exclusão

**Nota:** A exclusão é lógica (soft delete), os dados não são removidos permanentemente.

## 🔄 Fluxo de Uso no Sistema de Carga

1. Usuário acessa `/excel`
2. Sistema carrega grupos e tabelas do banco de dados
3. Grupos são exibidos colapsáveis na sidebar
4. Ao clicar em uma tabela:
   - Se houver modelo, botão "Baixar Modelo" aparece
   - Usuário pode fazer upload do Excel
   - Sistema valida estrutura contra as colunas definidas

## 📊 Exemplo de Cadastro Completo

### Grupo: RH (Recursos Humanos)

```
Código: RH
Nome: Recursos Humanos
Descrição: Tabelas relacionadas ao setor de RH
Ícone: 👥
```

### Tabelas do Grupo RH:

#### 1. FUNCIONARIOS
```
Nome da Tabela: FUNCIONARIOS
Nome de Exibição: Funcionários
Descrição: Cadastro de funcionários ativos e inativos
Ícone: 👤
Grupo: RH
Modelo: funcionarios_modelo.xlsx
```

Colunas do modelo:
- Matricula
- Nome
- CPF
- DataAdmissao
- Cargo
- Departamento
- Salario

#### 2. FOLHA_PAGAMENTO
```
Nome da Tabela: FOLHA_PAGAMENTO
Nome de Exibição: Folha de Pagamento
Descrição: Dados mensais da folha de pagamento
Ícone: 💰
Grupo: RH
Modelo: folha_pagamento_modelo.xlsx
```

## 🔐 Segurança

- Interface `/excel/admin` é de acesso público (qualquer pessoa pode visualizar)
- Endpoints de criação/edição/exclusão (POST, PUT, DELETE) requerem autenticação e privilégio de admin
- Endpoints de listagem (GET) são públicos - qualquer pessoa pode visualizar
- Upload de arquivos validado (apenas .xlsx e .xls)
- Soft delete preserva histórico
- Ao tentar salvar/excluir sem estar logado, sistema solicita login

## 🐛 Troubleshooting

### Problema: Grupo não aparece na listagem

**Solução:** Verifique se `IsActive = 1` no banco:
```sql
UPDATE TableGroups SET IsActive = 1 WHERE Code = 'SEU_GRUPO';
```

### Problema: Tabela não carrega estrutura do modelo

**Solução:** Re-upload do arquivo modelo:
1. Edite a tabela
2. Faça upload novamente do arquivo Excel
3. Salve

### Problema: Erro ao criar tabela com nome duplicado

**Solução:** Cada `TableName` deve ser único. Escolha outro nome ou delete a tabela antiga.

## 📚 APIs Disponíveis

### Grupos

- `GET /api/excel/groups` - Listar grupos (requer auth)
- `POST /api/excel/groups` - Criar grupo (requer admin)
- `PUT /api/excel/groups/:id` - Atualizar grupo (requer admin)
- `DELETE /api/excel/groups/:id` - Excluir grupo (requer admin)

### Tabelas

- `GET /api/excel/table-definitions` - Listar tabelas
- `POST /api/excel/table-definitions` - Criar tabela (requer admin)
- `PUT /api/excel/table-definitions/:id` - Atualizar tabela (requer admin)
- `DELETE /api/excel/table-definitions/:id` - Excluir tabela (requer admin)

### Sistema de Carga

- `GET /api/excel/tabelas` - Listar grupos e tabelas para o sistema de carga
- `POST /api/excel/upload/:tabela` - Upload de arquivo para tabela específica
- `POST /api/excel/upload-temp` - Upload para tabela temporária

## 📝 Notas Importantes

1. **Nomes de Tabelas**: Devem corresponder exatamente ao nome da tabela no banco SERVER55\DW - database Fonte
2. **Modelos Excel**: Primeira linha = cabeçalhos, segunda linha em diante = dados
3. **Grupos**: Código não pode ser alterado após criação (usado como chave)
4. **Backup**: Faça backup do banco antes de executar scripts SQL
5. **Permissões**: Usuário `servicedw` precisa ter permissões no banco PowerBIPortal

## ✅ Checklist de Implementação

- [x] Scripts SQL criados
- [x] Estrutura de tabelas no banco
- [x] Dados do ADP migrados
- [x] Endpoints de API implementados
- [x] Interface administrativa criada
- [x] Sistema de carga integrado
- [x] Validação de arquivos
- [x] Soft delete implementado
- [x] Documentação completa

## 🎉 Próximos Passos

Após executar os scripts SQL, você pode:

1. Acessar `/excel/admin` e verificar se o grupo ADP aparece
2. Criar novos grupos conforme necessário
3. Cadastrar novas tabelas com seus modelos
4. Testar o sistema de carga em `/excel`

---

**Desenvolvido para:** AACD - Portal Power BI  
**Data:** 25/11/2025  
**Versão:** 1.0
