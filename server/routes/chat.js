'use strict';
const express = require('express');
const router = express.Router();
const { sql, getPool } = require('../db');
const { authenticateToken, optionalAuthenticate } = require('../middleware/auth');

const DIRECT_LINE_SECRET = process.env.DIRECT_LINE_SECRET;
const DIRECT_LINE_ENDPOINT = process.env.DIRECT_LINE_ENDPOINT || 'https://directline.botframework.com/v3/directline';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fetchFn = (typeof fetch !== 'undefined')
    ? fetch
    : (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function validateSQLSyntax(sqlText) {
    const pool = getPool();
    if (!pool || !pool.connected) return { ok: true };
    try {
        const trimmedSQL = sqlText.trim().toUpperCase();
        if (trimmedSQL.startsWith('WITH')) {
            const lastSelectIndex = sqlText.lastIndexOf('SELECT');
            if (lastSelectIndex === -1) return { ok: false, error: 'CTE sem SELECT principal' };
            const validationSQL = sqlText.substring(0, lastSelectIndex + 6) + ' TOP 0' + sqlText.substring(lastSelectIndex + 6);
            const req = pool.request();
            req.timeout = 5000;
            await req.query(validationSQL);
            return { ok: true };
        }
        const req = pool.request();
        await req.batch(`SET NOEXEC ON; ${sqlText}; SET NOEXEC OFF;`);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e?.message || String(e) };
    }
}

function validateUserRequest(userQuery, dataDictionary) {
    const query = (userQuery || '').toLowerCase().trim();
    if (!query || query.length < 3) {
        return { isValid: false, reason: 'empty_query', message: 'Por favor, faça uma pergunta sobre os dados disponíveis.' };
    }
    if (!dataDictionary || !dataDictionary.tables || dataDictionary.tables.length === 0) {
        return { isValid: false, reason: 'no_dictionary', message: 'Nenhum dicionário de dados está configurado. Configure um dicionário no painel administrativo.' };
    }
    return { isValid: true };
}

// GET /api/chat/models
router.get('/models', optionalAuthenticate, async (req, res) => {
    try {
        res.json({
            provider: 'copilot-agent',
            transport: 'botframework-directline',
            endpoint: DIRECT_LINE_ENDPOINT ? 'configured' : 'missing',
            note: 'Copilot Agent não expõe lista de modelos via Direct Line.'
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar modelos disponíveis' });
    }
});

// POST /api/chat/ai-sql
router.post('/ai-sql', optionalAuthenticate, async (req, res) => {
    try {
        const { userQuery, dataDictionary } = req.body || {};
        if (!userQuery || typeof userQuery !== 'string') {
            return res.status(400).json({ 
                error: 'userQuery é obrigatório',
                details: 'O campo userQuery deve ser uma string válida',
                stage: 'input_validation'
            });
        }

        const validation = validateUserRequest(userQuery, dataDictionary);
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Solicitação inválida',
                details: validation.message,
                reason: validation.reason,
                stage: 'request_validation'
            });
        }
        if (!DIRECT_LINE_SECRET) {
            return res.status(500).json({ 
                error: 'Direct Line não configurado no servidor',
                details: 'Variável DIRECT_LINE_SECRET não encontrada no arquivo .env',
                stage: 'configuration_error'
            });
        }

        const rules = `INSTRUÇÃO ABSOLUTA: Responda APENAS com a consulta SQL. Não adicione explicações, comentários ou texto extra.

Você é um assistente especializado em gerar consultas SQL para SQL Server (T-SQL).

DICIONÁRIO DE DADOS DAS TABELAS DISPONÍVEIS:
${dataDictionary ? JSON.stringify(dataDictionary, null, 2) : '(Dicionário não informado)'}

REGRAS OBRIGATÓRIAS:
1. Use APENAS comandos SELECT
2. Para filtros de data, SEMPRE use as funções MONTH() e YEAR()
3. Para contagens, use COUNT(*) com alias descritivo
4. Use TOP 100 para limitar resultados quando necessário
5. Evite SELECT *, prefira colunas específicas
6. Se a pergunta mencionar dados que não existem no dicionário, responda: "DADOS_NAO_ENCONTRADOS"
7. **NOVO: Para queries "TOP N ao longo do tempo", use CTE para filtrar primeiro:**
Exemplo: "top 3 setores ao longo dos meses" deve gerar:
WITH TopN AS (SELECT TOP N coluna FROM tabela GROUP BY coluna ORDER BY SUM(valor) DESC)
SELECT mes, ano, coluna, SUM(valor) FROM tabela WHERE coluna IN (SELECT coluna FROM TopN) GROUP BY mes, ano, coluna ORDER BY ano, mes

MAPEAMENTO DE MESES EM PORTUGUÊS (OBRIGATÓRIO):
- janeiro = 1, fevereiro = 2, março = 3, abril = 4
- maio = 5, junho = 6, julho = 7, agosto = 8
- setembro = 9, outubro = 10, novembro = 11, dezembro = 12

PERGUNTA DO USUÁRIO: ${userQuery}

Gere APENAS a consulta SQL (sem explicações):`;

        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        if (!convResp.ok) {
            const errorText = await convResp.text().catch(() => 'Erro desconhecido');
            return res.status(502).json({ 
                error: 'Falha ao conectar com Copilot Agent', 
                details: `Status: ${convResp.status}, Resposta: ${errorText}`,
                stage: 'conversation_start'
            });
        }
        const conv = await convResp.json();
        const conversationId = conv.conversationId;

        const activity = { type: 'message', from: { id: 'user' }, text: rules };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${DIRECT_LINE_SECRET}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(activity)
        });
        if (!postResp.ok) {
            const errorText = await postResp.text().catch(() => 'Erro desconhecido');
            return res.status(502).json({ 
                error: 'Falha ao enviar pergunta ao Copilot', 
                details: `Status: ${postResp.status}, Resposta: ${errorText}`,
                stage: 'message_send'
            });
        }

        let watermark;
        let replyText = '';
        for (let i = 0; i < 30; i++) {
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
            });
            if (!actResp.ok) {
                const errorText = await actResp.text().catch(() => 'Erro desconhecido');
                return res.status(502).json({ 
                    error: 'Falha ao obter resposta do Copilot', 
                    details: `Status: ${actResp.status}, Resposta: ${errorText}`,
                    stage: 'response_polling'
                });
            }
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => a.type === 'message' && a.from && a.from.id && a.from.id !== 'user');
            const last = activities.length ? activities[activities.length - 1] : null;
            if (last && last.text) { replyText = last.text; break; }
            await sleep(1000);
        }

        if (!replyText) {
            return res.status(504).json({ 
                error: 'Copilot Agent não respondeu dentro do tempo limite',
                details: 'Nenhuma resposta após 30 tentativas',
                stage: 'response_timeout'
            });
        }

        let sqlText = replyText;
        const sqlBlockMatch = replyText.match(/```sql\s*([\s\S]*?)\s*```/i);
        if (sqlBlockMatch) sqlText = sqlBlockMatch[1];
        else sqlText = replyText
            .replace(/```sql\n?/gi, '')
            .replace(/```\n?/gi, '')
            .replace(/^sql\n?/i, '');

        sqlText = sqlText
            .replace(/O conteúdo gerado por IA pode estar incorreto.*$/gi, '')
            .replace(/\s*AI-generated content may be incorrect.*$/gi, '')
            .replace(/\s*Nota:.*$/gim, '')
            .replace(/\s*Note:.*$/gim, '')
            .replace(/\s*Observação:.*$/gim, '')
            .replace(/\s*Esta consulta.*$/gim, '')
            .replace(/\s*This query.*$/gim, '')
            .trim()
            .replace(/\n\s*\n/g, '\n')
            .trim();

        if (sqlText.includes('DADOS_NAO_ENCONTRADOS') || sqlText.includes('dados não encontrados')) {
            return res.status(400).json({
                error: 'Dados não encontrados',
                details: 'Não consegui encontrar os dados solicitados no dicionário disponível.',
                stage: 'data_not_found'
            });
        }
        if (!/^(select|with)/i.test(sqlText)) {
            return res.status(400).json({ 
                error: 'Copilot não gerou uma consulta SELECT ou CTE válida',
                details: `SQL limpa: "${sqlText}"`,
                originalResponse: replyText,
                stage: 'sql_validation'
            });
        }

        // Ajuste opcional de mês (regra leve) — mantido do servidor original
        const userQueryLower = userQuery.toLowerCase();
        const monthsPortuguese = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
        const mentionedMonth = monthsPortuguese.find(month => userQueryLower.includes(month));
        if (mentionedMonth && !sqlText.includes('MONTH(') && !sqlText.includes('WHERE')) {
            const monthNumber = monthsPortuguese.indexOf(mentionedMonth) + 1;
            if (sqlText.includes('COUNT(*)') && /FROM\s+Atendimentos/i.test(sqlText)) {
                const alias = `Atendimentos${mentionedMonth.charAt(0).toUpperCase() + mentionedMonth.slice(1)}`;
                sqlText = sqlText.replace(/SELECT COUNT\(\*\) AS \w+/i, `SELECT COUNT(*) AS ${alias}`)
                                 .replace(/FROM Atendimentos/i, `FROM Atendimentos WHERE MONTH(DataAtendimento) = ${monthNumber} AND YEAR(DataAtendimento) = YEAR(GETDATE())`);
            }
        }

        const syntaxCheck = await validateSQLSyntax(sqlText);
        if (!syntaxCheck.ok) {
            return res.status(400).json({
                error: 'SQL gerada contém erros de sintaxe',
                details: `Erro: ${syntaxCheck.error}`,
                sql: sqlText,
                originalResponse: replyText,
                stage: 'syntax_validation'
            });
        }

        return res.json({ sql: sqlText, originalResponse: replyText });
    } catch (err) {
        return res.status(500).json({ error: 'Erro interno do servidor', details: err.message, stage: 'internal_error' });
    }
});

// POST /api/chat/analyze
router.post('/analyze', optionalAuthenticate, async (req, res) => {
    try {
        const { userQuery, sqlQuery, results } = req.body;
        if (!userQuery || !sqlQuery || !results) {
            return res.status(400).json({ error: 'Dados insuficientes para análise', stage: 'input_validation' });
        }
        if (!DIRECT_LINE_SECRET) {
            return res.status(500).json({ error: 'Serviço de análise não configurado', stage: 'configuration_error' });
        }
        const dataForAnalysis = results.slice(0, 50);
        const currentYear = new Date().getFullYear();
        const currentDate = new Date().toISOString().split('T')[0];
        const analysisPrompt = `CONTEXTO:
- Data execução: ${currentDate}
- Fonte: resultados SQL HISTÓRICOS (dados já existentes)
- Ano referência: ${currentYear}

PERGUNTA DO USUÁRIO:
${userQuery}

SQL EXECUTADO:
${sqlQuery}

RESULTADOS ( ${results.length} linhas, amostra ${dataForAnalysis.length} ):
${JSON.stringify(dataForAnalysis, null, 2)}

REGRAS OBRIGATÓRIAS:
1) Use apenas os dados fornecidos
2) Responda diretamente
3) Primeira frase = conclusão + comparação principal
4) 3–6 bullets com números essenciais
5) Mostre variações explícitas
6) Formatação numérica consistente
7) Sem desculpas
8) Idioma pt-BR`;

        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        if (!convResp.ok) return res.status(502).json({ error: 'Falha ao conectar com serviço de análise', stage: 'conversation_start' });

        const conv = await convResp.json();
        const conversationId = conv.conversationId;

        const activity = { type: 'message', from: { id: 'user' }, text: analysisPrompt };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(activity)
        });
        if (!postResp.ok) return res.status(502).json({ error: 'Falha ao solicitar análise', stage: 'message_send' });

        let watermark, replyText = '';
        for (let i = 0; i < 30; i++) {
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, { method: 'GET', headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` } });
            if (!actResp.ok) return res.status(502).json({ error: 'Falha ao obter análise', stage: 'response_polling' });
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => a.type === 'message' && a.from && a.from.id && a.from.id !== 'user');
            const last = activities.length ? activities[activities.length - 1] : null;
            if (last && last.text) { replyText = last.text; break; }
            await sleep(1000);
        }
        if (!replyText) return res.status(504).json({ error: 'Tempo esgotado aguardando análise', stage: 'response_timeout' });

        replyText = replyText
            .replace(/O conteúdo gerado por IA pode estar incorreto.*$/gi, '')
            .replace(/\s*AI-generated content may be incorrect.*$/gi, '')
            .replace(/\s*Nota:.*$/gim, '')
            .replace(/\s*Note:.*$/gim, '')
            .trim();

        return res.json({ analysis: replyText, conversationId });
    } catch (err) {
        return res.status(500).json({ error: 'Erro interno ao processar análise', details: err.message, stage: 'internal_error' });
    }
});

// POST /api/chat/generate-chart
router.post('/generate-chart', optionalAuthenticate, async (req, res) => {
    try {
        const { userQuery, sqlQuery, results, analysis } = req.body;
        if (!results || results.length === 0) return res.status(400).json({ error: 'Sem dados', stage: 'validation' });
        if (!DIRECT_LINE_SECRET) return res.status(500).json({ error: 'Direct Line não configurado', stage: 'configuration' });

        const columns = Object.keys(results[0]);
        const sampleData = results.slice(0, 15);
        const yearMatch = sqlQuery && sqlQuery.match(/YEAR\([^)]+\)\s*=\s*(\d{4})/i);
        const yearFromSQL = yearMatch ? parseInt(yearMatch[1]) : null;

        const intelligentPrompt = `Você é um especialista em análise de dados e visualização.
CONTEXTO:
Pergunta: ${userQuery}
SQL executada: ${sqlQuery}
Análise: ${analysis || 'N/A'}
${yearFromSQL ? `Ano filtrado no SQL: ${yearFromSQL}` : ''}

ESTRUTURA DOS DADOS:
Colunas: ${columns.join(', ')}
Total de linhas: ${results.length}

AMOSTRA DOS DADOS (${sampleData.length} linhas):
${JSON.stringify(sampleData, null, 2)}

SUA TAREFA:
Retorne um único JSON com dataAnalysis e chartConfig conforme especificação. Responda apenas o JSON válido.`;

        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        if (!convResp.ok) return res.status(502).json({ error: 'Falha ao conectar', stage: 'conversation_start' });

        const conv = await convResp.json();
        const conversationId = conv.conversationId;

        const activity = { type: 'message', from: { id: 'user' }, text: intelligentPrompt };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(activity)
        });
        if (!postResp.ok) return res.status(502).json({ error: 'Falha ao enviar', stage: 'message_send' });

        let watermark, replyText = '';
        for (let i = 0; i < 30; i++) {
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, { method: 'GET', headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` } });
            if (!actResp.ok) return res.status(502).json({ error: 'Falha polling', stage: 'response_polling' });
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => a.type === 'message' && a.from && a.from.id && a.from.id !== 'user');
            const last = activities.length ? activities[activities.length - 1] : null;
            if (last && last.text) { replyText = last.text; break; }
            await sleep(1000);
        }
        if (!replyText) return res.status(504).json({ error: 'Timeout', stage: 'timeout' });

        replyText = replyText
            .replace(/O conteúdo gerado por IA pode estar incorreto.*$/gi, '')
            .replace(/\s*AI-generated content may be incorrect.*$/gi, '')
            .replace(/```json\n?/gi, '')
            .replace(/```\n?/gi, '')
            .trim();

        let intelligentResponse;
        try {
            const jsonMatch = replyText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) throw new Error('JSON não encontrado');
            intelligentResponse = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            return res.status(400).json({ error: 'Resposta inválida', details: replyText.substring(0, 300), stage: 'parse_error' });
        }

        let processedResults = results;
        const dataAnalysis = intelligentResponse.dataAnalysis;

        // Criar colunas temporais derivadas
        if (dataAnalysis?.hasTemporalData && dataAnalysis.temporalColumns) {
            const { year, month } = dataAnalysis.temporalColumns;
            if (year && month) {
                processedResults = results.map(r => ({ ...r, AnoMes: `${r[year]}-${String(r[month]).padStart(2, '0')}` }));
                if (intelligentResponse.chartConfig.xColumn === month || intelligentResponse.chartConfig.xColumn === year) {
                    intelligentResponse.chartConfig.xColumn = 'AnoMes';
                }
            } else if (dataAnalysis.temporalColumns.month && yearFromSQL) {
                const mCol = dataAnalysis.temporalColumns.month;
                const monthNames = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
                const ys = String(yearFromSQL).slice(-2);
                processedResults = results.map(r => ({ ...r, MesFormatado: `${monthNames[parseInt(r[mCol]) - 1]}-${ys}` }));
                if (intelligentResponse.chartConfig.xColumn === mCol) intelligentResponse.chartConfig.xColumn = 'MesFormatado';
            }
        }

        // Pivot opcional
        if (dataAnalysis?.needsPivot && dataAnalysis.categoricalColumn) {
            const categoryCol = dataAnalysis.categoricalColumn;
            const valueCol = dataAnalysis.valueColumns?.[0];
            let dateKey = intelligentResponse.chartConfig.xColumn;
            if (dataAnalysis.temporalColumns && (dateKey === dataAnalysis.temporalColumns.month || dateKey === dataAnalysis.temporalColumns.year)) {
                dateKey = 'AnoMes';
            }
            const grouped = {};
            processedResults.forEach(row => {
                const date = row[dateKey];
                if (!grouped[date]) grouped[date] = { [dateKey]: date };
                const safeName = String(row[categoryCol]).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                grouped[date][safeName] = parseFloat(row[valueCol]) || 0;
            });
            processedResults = Object.values(grouped);
            intelligentResponse.chartConfig.xColumn = dateKey;
            const pivotedColumns = [...new Set(results.map(r => String(r[categoryCol]).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')))];
            intelligentResponse.chartConfig.yColumn = pivotedColumns;
        }

        // Ordenar temporalmente
        if (dataAnalysis?.hasTemporalData) {
            const xCol = intelligentResponse.chartConfig.xColumn;
            processedResults.sort((a, b) => (a[xCol] || '').toString().localeCompare((b[xCol] || '').toString()));
        }

        const chartConfig = intelligentResponse.chartConfig || {};
        if (!chartConfig.suitable) {
            return res.json({ suitable: false, reasoning: chartConfig.reasoning || 'Dados não adequados para visualização' });
        }

        const isMultiSeries = Array.isArray(chartConfig.yColumn) && chartConfig.yColumn.length >= 2;
        return res.json({
            suitable: true,
            type: chartConfig.chartType,
            title: chartConfig.title,
            xColumn: chartConfig.xColumn,
            yColumn: chartConfig.yColumn,
            reasoning: chartConfig.reasoning,
            showVariation: chartConfig.showVariation || false,
            isMultiSeries,
            data: processedResults
        });
    } catch (err) {
        return res.status(500).json({ error: 'Erro ao processar', details: err.message, stage: 'internal_error' });
    }
});

// POST /api/chat/copilot-chart
router.post('/copilot-chart', optionalAuthenticate, async (req, res) => {
    try {
        const { userQuery, sqlQuery, results } = req.body;
        if (!results || results.length === 0) return res.status(400).json({ error: 'Sem dados para visualização', stage: 'validation' });
        if (!DIRECT_LINE_SECRET) return res.status(500).json({ error: 'Direct Line não configurado', stage: 'configuration' });

        const columns = Object.keys(results[0]);
        const sampleData = results.slice(0, 50);
        const chartPrompt = `Você é um especialista em Chart.js. Analise os dados e gere código Chart.js COMPLETO e FUNCIONAL.

CONTEXTO:
Pergunta: ${userQuery}
SQL: ${sqlQuery}

ESTRUTURA:
Colunas: ${columns.join(', ')}
Registros: ${results.length}

AMOSTRA (${sampleData.length} linhas):
${JSON.stringify(sampleData, null, 2)}

TAREFA:
Gere código JavaScript EXECUTÁVEL que crie um gráfico Chart.js. O código será executado em sandbox com acesso a:
- Chart (Chart.js v4)
- ctx (canvas context)
- canvas (elemento canvas)

REQUISITOS:
1. Escolha o tipo adequado
2. Séries temporais: ordenar por período
3. Detectar colunas temporais/categóricas
4. Para múltiplas séries: datasets separados
5. Cores e tooltips profissionais
6. Título descritivo

FORMATO:
Retorne APENAS o código JavaScript (sem markdown).`;

        const convResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` }
        });
        if (!convResp.ok) return res.status(502).json({ error: 'Falha ao conectar', stage: 'conversation_start' });

        const conv = await convResp.json();
        const conversationId = conv.conversationId;

        const activity = { type: 'message', from: { id: 'user' }, text: chartPrompt };
        const postResp = await fetchFn(`${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(activity)
        });
        if (!postResp.ok) return res.status(502).json({ error: 'Falha ao enviar', stage: 'message_send' });

        let watermark, replyText = '';
        for (let i = 0; i < 30; i++) {
            const url = `${DIRECT_LINE_ENDPOINT}/conversations/${conversationId}/activities${watermark ? `?watermark=${watermark}` : ''}`;
            const actResp = await fetchFn(url, { method: 'GET', headers: { 'Authorization': `Bearer ${DIRECT_LINE_SECRET}` } });
            if (!actResp.ok) return res.status(502).json({ error: 'Falha polling', stage: 'response_polling' });
            const payload = await actResp.json();
            watermark = payload.watermark;
            const activities = (payload.activities || []).filter(a => a.type === 'message' && a.from && a.from.id && a.from.id !== 'user');
            const last = activities.length ? activities[activities.length - 1] : null;
            if (last && last.text) { replyText = last.text; break; }
            await sleep(1000);
        }
        if (!replyText) return res.status(504).json({ error: 'Timeout', stage: 'timeout' });

        let chartCode = replyText
            .replace(/O conteúdo gerado por IA pode estar incorreto.*$/gi, '')
            .replace(/\s*AI-generated content may be incorrect.*$/gi, '')
            .replace(/```javascript\n?/gi, '')
            .replace(/```js\n?/gi, '')
            .replace(/```\n?/gi, '')
            .trim();

        if (!chartCode.includes('new Chart')) {
            return res.status(400).json({ error: 'Código Chart.js inválido gerado', details: chartCode.substring(0, 300), stage: 'validation' });
        }
        return res.json({ chartCode, conversationId });
    } catch (err) {
        return res.status(500).json({ error: 'Erro interno', details: err.message, stage: 'internal_error' });
    }
});

// POST /api/chat/query
router.post('/query', optionalAuthenticate, async (req, res) => {
    try {
        const { query } = req.body || {};
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ message: 'Query SQL é obrigatória', error: 'Query SQL é obrigatória' });
        }

        const normalized = query.trim().toUpperCase();
        const dangerous = ['INSERT','UPDATE','DELETE','DROP','CREATE','ALTER','TRUNCATE','EXEC','EXECUTE','MERGE','BULK'];
        for (const kw of dangerous) {
            if (normalized.includes(kw)) {
                return res.status(403).json({
                    message: `Operação não permitida: ${kw}. Apenas consultas SELECT são permitidas.`,
                    error: 'Operação não permitida'
                });
            }
        }
        if (!normalized.startsWith('SELECT') && !normalized.startsWith('WITH')) {
            return res.status(403).json({ message: 'Apenas consultas SELECT ou CTEs são permitidas.', error: 'Apenas SELECT/CTE' });
        }

        const pool = getPool();
        if (!pool || !pool.connected) {
            return res.status(503).json({ message: 'Banco de dados indisponível', error: 'DB indisponível' });
        }

        const request = pool.request();
        request.timeout = 30000;
        const start = Date.now();
        const result = await request.query(query);
        const ms = Date.now() - start;

        if (req.user) {
            try {
                await pool.request()
                    .input('userId', sql.Int, req.user.id)
                    .input('action', sql.NVarChar, 'CHATBOT_QUERY')
                    .input('details', sql.NVarChar, query.substring(0, 500))
                    .query(`INSERT INTO AccessLogs (UserId, Action, AccessTime, Details) VALUES (@userId, @action, GETDATE(), @details)`);
            } catch (_) {}
        }

        return res.json({
            success: true,
            results: result.recordset || [],
            rowCount: (result.recordset || []).length,
            executionTime: ms
        });
    } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        let userMsg = 'Erro ao executar consulta';
        if (/Invalid object name/i.test(msg)) userMsg = 'Tabela não encontrada. Verifique o nome da tabela.';
        else if (/Invalid column name/i.test(msg)) userMsg = 'Coluna não encontrada. Verifique o nome da coluna.';
        else if (/timeout/i.test(msg)) userMsg = 'A consulta demorou muito para executar. Tente uma consulta mais simples.';
        else if (/Incorrect syntax/i.test(msg)) userMsg = 'Erro de sintaxe SQL. A query gerada está malformada.';
        return res.status(400).json({ message: userMsg, error: msg, timestamp: new Date().toISOString() });
    }
});

// GET /api/chat/dictionary
router.get('/dictionary', optionalAuthenticate, async (req, res) => {
    try {
        const pool = getPool();
        const result = await pool.request().query(`
            SELECT 
                t.TABLE_NAME as tableName,
                c.COLUMN_NAME as columnName,
                c.DATA_TYPE as dataType,
                c.CHARACTER_MAXIMUM_LENGTH as maxLength,
                c.IS_NULLABLE as isNullable
            FROM INFORMATION_SCHEMA.TABLES t
            JOIN INFORMATION_SCHEMA.COLUMNS c ON t.TABLE_NAME = c.TABLE_NAME
            WHERE t.TABLE_TYPE = 'BASE TABLE'
                AND t.TABLE_SCHEMA = 'dbo'
                AND t.TABLE_NAME NOT LIKE 'sys%'
            ORDER BY t.TABLE_NAME, c.ORDINAL_POSITION
        `);
        const dictionary = {};
        result.recordset.forEach(row => {
            if (!dictionary[row.tableName]) dictionary[row.tableName] = { name: row.tableName, columns: [] };
            dictionary[row.tableName].columns.push({
                name: row.columnName,
                type: row.dataType,
                maxLength: row.maxLength,
                nullable: row.isNullable === 'YES'
            });
        });
        res.json({ success: true, dictionary: Object.values(dictionary) });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar estrutura do banco de dados' });
    }
});

module.exports = router;
