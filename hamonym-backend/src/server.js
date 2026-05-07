require('dotenv').config();

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const pool = require('./db');

const app = express();

app.use(cors());

app.use(express.json());

/* TEST DB */

app.get('/test-db', async (req, res) => {

    try {

        const result = await pool.query('SELECT NOW()');

        res.json(result.rows);

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: 'DB Error'
        });

    }

});

/* ROOT */

app.get('/', (req, res) => {

    res.json({
        message: 'Hamonym API Running'
    });

});

/* REGISTER */

app.post('/auth/register', async (req, res) => {

    try {

        const {
            email,
            password,
            full_name
        } = req.body;

        if (!email || !password) {

            return res.status(400).json({
                error: 'Missing fields'
            });

        }

        const existingUser = await pool.query(
            `
            SELECT id
            FROM users
            WHERE LOWER(email) = LOWER($1)
            `,
            [email]
        );

        if (existingUser.rows.length > 0) {

            return res.status(409).json({
                error: 'Email already exists'
            });

        }

        const passwordHash = await bcrypt.hash(password, 10);

        const result = await pool.query(
            `
            INSERT INTO users (
                role_id,
                email,
                password_hash,
                full_name
            )
            VALUES ($1, $2, $3, $4)
            RETURNING id, email, full_name
            `,
            [
                1,
                email,
                passwordHash,
                full_name || null
            ]
        );

        const user = result.rows[0];

        const token = jwt.sign(
            {
                userId: user.id
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '7d'
            }
        );

        res.json({
            token,
            user
        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: 'Register failed'
        });

    }

});

/* LOGIN */

app.post('/auth/login', async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;

        const result = await pool.query(
            `
            SELECT *
            FROM users
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [email]
        );

        if (result.rows.length === 0) {

            return res.status(401).json({
                error: 'Invalid credentials'
            });

        }

        const user = result.rows[0];

        const validPassword = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!validPassword) {

            return res.status(401).json({
                error: 'Invalid credentials'
            });

        }

        await pool.query(
            `
            UPDATE users
            SET last_login_at = NOW()
            WHERE id = $1
            `,
            [user.id]
        );

        const token = jwt.sign(
            {
                userId: user.id,
                roleId: user.role_id
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '7d'
            }
        );

        res.json({

            token,

            user: {

                id: user.id,
                email: user.email,
                full_name: user.full_name,
                role_id: user.role_id

            }

        });

    } catch (err) {

        console.error(err);

        res.status(500).json({
            error: 'Login failed'
        });

    }

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);

});