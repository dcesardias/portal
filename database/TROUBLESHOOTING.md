# 🔧 Guia de Troubleshooting - Sistema de Cadastro

## Problema: Grupos não aparecem na tela de cadastro

### Sintomas
- Ao acessar `/excel/admin`, a lista de grupos está vazia
- Aparece "Carregando grupos..." mas nada é exibido
- Console do navegador mostra erros 401, 403 ou 500

### Soluções

#### 1. Verificar se as tabelas foram criadas no banco

Execute no SQL Server Management Studio:

```sql
USE PowerBIPortal;

-- Verificar se as tabelas existem
SELECT * FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_NAME IN ('TableGroups', 'TableDefinitions');

-- Se retornar 2 linhas, as tabelas existem
-- Se retornar 0 ou 1 linha, execute o script:
-- database\01_create_tables.sql
```

#### 2. Verificar se há dados nas tabelas

```sql
-- Verificar grupos
SELECT * FROM TableGroups WHERE IsActive = 1;

-- Verificar tabelas
SELECT * FROM TableDefinitions WHERE IsActive = 1;

-- Se ambos retornarem 0 linhas, execute o script:
-- database\02_insert_adp_data.sql
```

#### 3. Executar script de verificação completo

Execute o arquivo:
```
database\03_verify_installation.sql
```

Este script verificará:
- Existência das tabelas
- Dados cadastrados
- Índices criados
- Permissões do usuário

#### 4. Verificar autenticação no navegador

1. Abra o Console do Navegador (F12)
2. Vá para a aba "Application" ou "Armazenamento"
3. Verifique se existe um item `token` no LocalStorage
4. Se NÃO existir:
   - Faça logout e login novamente no portal
   - Verifique se você é administrador
5. Se EXISTIR mas os grupos não carregam:
   - Copie o token
   - Teste manualmente via Postman ou curl:
   
```bash
curl -H "Authorization: Bearer SEU_TOKEN_AQUI" http://seu-servidor/api/excel/groups
```

#### 5. Verificar logs do servidor

Procure no terminal onde o Node.js está rodando por mensagens de erro:

```
Erro ao buscar grupos: ...
DB pool is null or disconnected
```

Se aparecer "DB pool is null", reinicie o servidor Node.js.

#### 6. Verificar permissões do usuário do banco

Execute no SQL Server:

```sql
-- Ver qual usuário o Node.js está usando
-- (verificar no arquivo .env ou server.js: DB_USER)

-- Verificar permissões
USE PowerBIPortal;
EXEC sp_helprotect NULL, 'servicedw'; -- Substitua pelo seu usuário

-- Conceder permissões se necessário
GRANT SELECT, INSERT, UPDATE ON TableGroups TO servicedw;
GRANT SELECT, INSERT, UPDATE ON TableDefinitions TO servicedw;
```

#### 7. Recarregar grupos manualmente

Na tela `/excel/admin`:
1. Abra o Console do navegador (F12)
2. Digite:
```javascript
loadGroups().then(() => console.log('Grupos:', groups));
```
3. Veja a resposta no console

#### 8. Verificar se o servidor está usando o banco correto

No arquivo `server.js`, procure por:
```javascript
const config = {
    user: process.env.DB_USER || 'servicedw',
    password: process.env.DB_PASS || '@aacdservice',
    server: process.env.DB_SERVER || 'SERVER55',
    database: process.env.DB_NAME || 'PowerBIPortal',
```

Confirme que `database` está como `'PowerBIPortal'`.

---

## Problema: Dropdown de grupos vazio ao criar/editar tabela

### Sintomas
- Ao clicar em "Nova Tabela", o campo "Grupo" só mostra "Sem grupo"
- Grupos não aparecem na lista suspensa

### Soluções

#### 1. Verificar se grupos foram carregados

1. Abra o Console (F12)
2. Digite:
```javascript
console.log('Grupos carregados:', groups);
```
3. Se retornar array vazio `[]`, volte para as soluções do problema anterior
4. Se retornar array com dados, continue

#### 2. Forçar recarga do dropdown

No Console:
```javascript
loadGroupsDropdown();
```

#### 3. Verificar elemento HTML

No Console:
```javascript
document.getElementById('tableGroup');
```
Se retornar `null`, há um problema no HTML da modal.

#### 4. Recarregar a página

Simplesmente recarregue a página com F5.

---

## Problema: Botão Admin não aparece em /excel

### Solução

1. Limpe o cache do navegador (Ctrl + Shift + Delete)
2. Recarregue a página com Ctrl + F5
3. Se ainda não aparecer, verifique se o arquivo `index.html` foi atualizado corretamente

---

## Problema: Não consigo salvar/editar/excluir grupos ou tabelas

### Sintomas
- Ao tentar salvar, aparece: "Você precisa estar logado como administrador"
- Botões de editar/excluir não funcionam

### Soluções

#### 1. Fazer login como administrador

1. Vá para a página inicial `/`
2. Faça login com usuário administrador
3. Volte para `/excel/admin`
4. Tente salvar/editar novamente

#### 2. Verificar se é administrador

Execute no SQL Server:
```sql
SELECT Username, IsAdmin FROM Users WHERE Username = 'seu_usuario';
```

Se `IsAdmin` for `0`, atualize:
```sql
UPDATE Users SET IsAdmin = 1 WHERE Username = 'seu_usuario';
```

#### 3. Token expirado

Tokens expiram após 24 horas. Faça login novamente.

**Nota:** Visualizar a tela `/excel/admin` e os grupos/tabelas NÃO requer login. Apenas operações de modificação (criar, editar, excluir) requerem autenticação de administrador.

---

## Comandos Úteis de Debug

### No Console do Navegador (F12)

```javascript
// Ver token atual
localStorage.getItem('token')

// Ver grupos carregados
console.log(groups)

// Ver tabelas carregadas
console.log(tables)

// Forçar recarga de grupos
await loadGroups()

// Forçar recarga do dropdown
await loadGroupsDropdown()

// Testar requisição manualmente
fetch('/api/excel/groups', {
    headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token')
    }
}).then(r => r.json()).then(console.log)
```

### No SQL Server

```sql
-- Ver grupos e contagem de tabelas
SELECT g.*, COUNT(t.Id) as TotalTabelas
FROM TableGroups g
LEFT JOIN TableDefinitions t ON g.Id = t.GroupId AND t.IsActive = 1
WHERE g.IsActive = 1
GROUP BY g.Id, g.Code, g.Name, g.Description, g.Icon, g.IsActive, g.CreatedAt, g.UpdatedAt;

-- Ver tabelas com nome do grupo
SELECT t.*, g.Name as GroupName
FROM TableDefinitions t
LEFT JOIN TableGroups g ON t.GroupId = g.Id
WHERE t.IsActive = 1;

-- Reativar grupo/tabela deletada
UPDATE TableGroups SET IsActive = 1 WHERE Code = 'CODIGO';
UPDATE TableDefinitions SET IsActive = 1 WHERE TableName = 'NOME_TABELA';
```

---

## Checklist de Verificação Completa

Use este checklist para garantir que tudo está funcionando:

- [ ] Tabelas `TableGroups` e `TableDefinitions` existem no banco PowerBIPortal
- [ ] Há pelo menos 1 grupo cadastrado (ADP)
- [ ] Há pelo menos 7 tabelas cadastradas (tabelas do ADP)
- [ ] Usuário está logado no portal
- [ ] Usuário tem `IsAdmin = 1`
- [ ] Token existe no LocalStorage
- [ ] Servidor Node.js está rodando sem erros
- [ ] Botão "Admin" aparece na tela `/excel`
- [ ] Ao acessar `/excel/admin`, grupos são exibidos
- [ ] Ao clicar "Nova Tabela", dropdown de grupos está preenchido
- [ ] Script `03_verify_installation.sql` não reporta erros

Se todos os itens estiverem marcados, o sistema está funcionando corretamente! ✅
