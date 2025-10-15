// create-admin.js
const bcrypt = require('bcryptjs');
const sql = require('mssql');

// Configuração do SQL Server (mesma do server.js)
const config = {
    user: 'servicedw',
    password: '@aacdservice',
    server: 'SERVER55',
    database: 'PowerBIPortal',
    options: {
        encrypt: false,
        trustServerCertificate: true
    }
};

async function createAdmin() {
    try {
        // Conectar ao banco
        const pool = await sql.connect(config);
        console.log('Conectado ao SQL Server');
        
        // Gerar hash da senha
        const password = 'admin123';
        const hash = await bcrypt.hash(password, 10);
        
        // Verificar se já existe
        const checkResult = await pool.request()
            .input('username', sql.NVarChar, 'admin')
            .query('SELECT Id FROM Users WHERE Username = @username');
        
        if (checkResult.recordset.length > 0) {
            // Atualizar senha existente
            await pool.request()
                .input('username', sql.NVarChar, 'admin')
                .input('hash', sql.NVarChar, hash)
                .query('UPDATE Users SET PasswordHash = @hash WHERE Username = @username');
            console.log('Senha do admin atualizada!');
        } else {
            // Criar novo usuário
            await pool.request()
                .input('username', sql.NVarChar, 'admin')
                .input('hash', sql.NVarChar, hash)
                .input('email', sql.NVarChar, 'admin@empresa.com')
                .input('fullName', sql.NVarChar, 'Administrador')
                .query(`
                    INSERT INTO Users (Username, PasswordHash, Email, FullName, IsAdmin)
                    VALUES (@username, @hash, @email, @fullName, 1)
                `);
            console.log('Usuário admin criado!');
        }
        
        console.log('\n✅ Credenciais de acesso:');
        console.log('   Usuário: admin');
        console.log('   Senha: admin123\n');
        
        process.exit(0);
    } catch (err) {
        console.error('Erro:', err);
        process.exit(1);
    }
}

createAdmin();