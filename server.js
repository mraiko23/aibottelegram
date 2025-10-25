const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Ensure database exists on every request
app.use(async (req, res, next) => {
    try {
        await ensureDBExists();
        next();
    } catch (error) {
        console.error('Database check failed:', error);
        next();
    }
});

// Helper functions
async function ensureDBExists() {
    try {
        await fs.access(DB_PATH);
    } catch (error) {
        // File doesn't exist, create it
        console.log('💾 Creating new database file...');
        const defaultDB = {
            users: [],
            chats: [],
            apiKeys: {
                huggingface: '',
                replicate: ''
            }
        };
        await fs.writeFile(DB_PATH, JSON.stringify(defaultDB, null, 2));
        console.log('✅ Database file created successfully');
    }
}

async function readDB() {
    // Ensure database exists before reading
    await ensureDBExists();
    
    try {
        const data = await fs.readFile(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If parsing fails, recreate with default structure
        console.error('❌ Error reading database:', error);
        console.log('🔧 Recreating database with default structure...');
        const defaultDB = {
            users: [],
            chats: [],
            apiKeys: {
                huggingface: '',
                replicate: ''
            }
        };
        await fs.writeFile(DB_PATH, JSON.stringify(defaultDB, null, 2));
        return defaultDB;
    }
}

async function writeDB(data) {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// Hash password
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Generate API key
function generateApiKey() {
    return 'sk-' + crypto.randomBytes(32).toString('hex');
}

// Generate session token
function generateSessionToken(userId) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    const userHash = crypto.createHash('md5').update(userId).digest('hex').substring(0, 8);
    return `sess_${timestamp}_${random}_${userHash}`;
}

// Verify Telegram WebApp initData
function verifyTelegramWebAppData(initData, botToken) {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get('hash');
        if (!hash) return false;
        
        urlParams.delete('hash');
        
        // Sort parameters
        const dataCheckArr = Array.from(urlParams.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => `${key}=${value}`);
        const dataCheckString = dataCheckArr.join('\n');
        
        // Create secret key
        const secretKey = crypto
            .createHmac('sha256', 'WebAppData')
            .update(botToken)
            .digest();
        
        // Calculate hash
        const calculatedHash = crypto
            .createHmac('sha256', secretKey)
            .update(dataCheckString)
            .digest('hex');
        
        return calculatedHash === hash;
    } catch (error) {
        console.error('Telegram verification error:', error);
        return false;
    }
}

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const db = await readDB();
        
        // Check if user exists
        const existingUser = db.users.find(u => u.username === username);
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Create new user
        const newUser = {
            id: Date.now().toString(),
            username,
            password: hashPassword(password),
            apiKey: generateApiKey(),
            createdAt: new Date().toISOString()
        };
        
        db.users.push(newUser);
        await writeDB(db);
        
        // Return user without password
        const { password: _, ...userResponse } = newUser;
        res.status(201).json(userResponse);
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }
        
        const db = await readDB();
        const user = db.users.find(u => 
            u.username === username && 
            u.password === hashPassword(password)
        );
        
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Generate session token
        const sessionToken = generateSessionToken(user.id);
        
        // Initialize sessions array if not exists
        if (!db.sessions) {
            db.sessions = [];
        }
        
        // Очистить старые сессии этого пользователя
        const userSessions = db.sessions.filter(s => s.userId === user.id);
        if (userSessions.length >= 3) {
            userSessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const sessionsToKeep = userSessions.slice(0, 2).map(s => s.token);
            db.sessions = db.sessions.filter(s => s.userId !== user.id || sessionsToKeep.includes(s.token));
            console.log(`🧹 Cleaned old sessions for user ${user.id}`);
        }
        
        // Save session
        db.sessions.push({
            token: sessionToken,
            userId: user.id,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        });
        
        console.log(`✅ Login session created for user ${user.id}. Total sessions:`, db.sessions.filter(s => s.userId === user.id).length);
        
        await writeDB(db);
        
        // Return user without password
        const { password: _, ...userResponse } = user;
        res.json({ 
            ...userResponse,
            sessionToken 
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Telegram WebApp Authentication
app.post('/api/auth/telegram', async (req, res) => {
    try {
        const { initData } = req.body;
        
        if (!initData) {
            return res.status(400).json({ error: 'initData required' });
        }
        
        // BOT TOKEN should be in environment variable
        // For development, you can set a default or skip verification
        const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        
        // Verify initData (skip in development if no token)
        if (BOT_TOKEN && !verifyTelegramWebAppData(initData, BOT_TOKEN)) {
            return res.status(401).json({ error: 'Invalid Telegram data' });
        }
        
        // Parse user data
        const urlParams = new URLSearchParams(initData);
        const userParam = urlParams.get('user');
        
        if (!userParam) {
            return res.status(400).json({ error: 'User data not found' });
        }
        
        const telegramUser = JSON.parse(userParam);
        const telegramId = telegramUser.id;
        
        const db = await readDB();
        
        // Find or create user
        let user = db.users.find(u => u.telegramId === telegramId);
        
        if (!user) {
            // Create new user from Telegram data
            user = {
                id: 'tg_' + telegramId,
                username: telegramUser.username || `user_${telegramId}`,
                firstName: telegramUser.first_name,
                lastName: telegramUser.last_name,
                telegramId: telegramId,
                apiKey: generateApiKey(),
                createdAt: new Date().toISOString()
            };
            
            db.users.push(user);
        }
        
        // Generate session token
        const sessionToken = generateSessionToken(user.id);
        
        // Initialize sessions array if not exists
        if (!db.sessions) {
            db.sessions = [];
        }
        
        // Очистить старые сессии этого пользователя (оставить только 3 последних)
        const userSessions = db.sessions.filter(s => s.userId === user.id);
        if (userSessions.length >= 3) {
            // Sort by creation date and keep only last 2
            userSessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const sessionsToKeep = userSessions.slice(0, 2).map(s => s.token);
            db.sessions = db.sessions.filter(s => s.userId !== user.id || sessionsToKeep.includes(s.token));
            console.log(`🧹 Cleaned old sessions for user ${user.id}`);
        }
        
        // Save new session
        db.sessions.push({
            token: sessionToken,
            userId: user.id,
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
        });
        
        console.log(`✅ Session created for user ${user.id} (${user.username}). Total sessions:`, db.sessions.filter(s => s.userId === user.id).length);
        
        await writeDB(db);
        
        // Return user data
        const { password, ...userResponse } = user;
        res.json({
            success: true,
            user: userResponse,
            sessionToken
        });
    } catch (error) {
        console.error('Telegram auth error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Verify session
app.post('/api/auth/verify-session', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ valid: false, error: 'No token provided' });
        }
        
        const token = authHeader.substring(7);
        const db = await readDB();
        
        if (!db.sessions) {
            return res.status(401).json({ valid: false, error: 'Session not found' });
        }
        
        const session = db.sessions.find(s => s.token === token);
        
        if (!session) {
            return res.status(401).json({ valid: false, error: 'Invalid session' });
        }
        
        // Check if session expired
        if (new Date(session.expiresAt) < new Date()) {
            // Remove expired session
            db.sessions = db.sessions.filter(s => s.token !== token);
            await writeDB(db);
            return res.status(401).json({ valid: false, error: 'Session expired' });
        }
        
        // Find user
        const user = db.users.find(u => u.id === session.userId);
        
        if (!user) {
            return res.status(401).json({ valid: false, error: 'User not found' });
        }
        
        // Return user without password
        const { password, ...userResponse } = user;
        res.json({ 
            valid: true, 
            user: userResponse 
        });
    } catch (error) {
        console.error('Session verification error:', error);
        res.status(500).json({ valid: false, error: 'Internal server error' });
    }
});

// ==================== CHAT ROUTES ====================

// Get all chats for a user
app.get('/api/chats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const db = await readDB();
        
        const userChats = db.chats.filter(chat => chat.userId === userId);
        res.json(userChats);
    } catch (error) {
        console.error('Get chats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create new chat
app.post('/api/chats', async (req, res) => {
    try {
        const { userId, title, model } = req.body;
        
        if (!userId || !title) {
            return res.status(400).json({ error: 'UserId and title required' });
        }
        
        const db = await readDB();
        
        const newChat = {
            id: 'chat_' + Date.now(),
            userId,
            title,
            messages: [],
            model: model || 'gpt-5',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        db.chats.push(newChat);
        await writeDB(db);
        
        res.status(201).json(newChat);
    } catch (error) {
        console.error('Create chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update chat
app.put('/api/chats/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const updates = req.body;
        
        console.log(`[SERVER] Updating chat ${chatId}`);
        console.log(`[SERVER] Updates:`, {
            hasMessages: !!updates.messages,
            messagesCount: updates.messages?.length,
            hasModel: !!updates.model,
            hasTitle: !!updates.title
        });
        
        const db = await readDB();
        const chatIndex = db.chats.findIndex(c => c.id === chatId);
        
        if (chatIndex === -1) {
            console.error(`[SERVER] Chat ${chatId} not found`);
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        const oldMessagesCount = db.chats[chatIndex].messages?.length || 0;
        
        db.chats[chatIndex] = {
            ...db.chats[chatIndex],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        const newMessagesCount = db.chats[chatIndex].messages?.length || 0;
        console.log(`[SERVER] Chat ${chatId} updated: ${oldMessagesCount} -> ${newMessagesCount} messages`);
        
        await writeDB(db);
        console.log(`[SERVER] ✅ Chat ${chatId} saved to database`);
        
        res.json(db.chats[chatIndex]);
    } catch (error) {
        console.error('[SERVER] Update chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete chat
app.delete('/api/chats/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const db = await readDB();
        
        const chatIndex = db.chats.findIndex(c => c.id === chatId);
        if (chatIndex === -1) {
            return res.status(404).json({ error: 'Chat not found' });
        }
        
        db.chats.splice(chatIndex, 1);
        await writeDB(db);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete chat error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== API KEY ROUTES ====================

// Get user's API key for external integrations
app.get('/api/user/:username/apikey', async (req, res) => {
    try {
        const { username } = req.params;
        const db = await readDB();
        const user = db.users?.find(u => u.username === username);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({ 
            username: user.username,
            apiKey: user.apiKey,
            createdAt: user.createdAt
        });
    } catch (error) {
        console.error('Get user API key error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Regenerate user's API key
app.post('/api/user/:username/apikey/regenerate', async (req, res) => {
    try {
        const { username } = req.params;
        const db = await readDB();
        const userIndex = db.users?.findIndex(u => u.username === username);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Generate new API key
        const newApiKey = generateApiKey();
        db.users[userIndex].apiKey = newApiKey;
        await writeDB(db);
        
        res.json({ 
            username: db.users[userIndex].username,
            apiKey: newApiKey,
            message: 'API key regenerated successfully'
        });
    } catch (error) {
        console.error('Regenerate API key error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get API keys
app.get('/api/keys', async (req, res) => {
    try {
        const db = await readDB();
        res.json(db.apiKeys);
    } catch (error) {
        console.error('Get API keys error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update API keys
app.put('/api/keys', async (req, res) => {
    try {
        const { huggingface, replicate } = req.body;
        const db = await readDB();
        
        if (huggingface !== undefined) {
            db.apiKeys.huggingface = huggingface;
        }
        if (replicate !== undefined) {
            db.apiKeys.replicate = replicate;
        }
        
        await writeDB(db);
        res.json(db.apiKeys);
    } catch (error) {
        console.error('Update API keys error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ==================== GENERATION ROUTES ====================

// Generate image - supports multiple providers
app.post('/api/generate/image', async (req, res) => {
    try {
        const { prompt, width = 1024, height = 1024, userId, chatId, provider = 'stable-diffusion' } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt required' });
        }
        
        // Get chat context if chatId is provided
        let contextualPrompt = prompt;
        if (chatId && userId) {
            const db = await readDB();
            const chat = db.chats?.find(c => c.id === chatId && c.userId === userId);
            
            if (chat && chat.messages && chat.messages.length > 0) {
                // Find last image generation request in chat history
                const recentMessages = chat.messages.slice(-10); // Last 10 messages
                const lastImageGeneration = recentMessages
                    .reverse()
                    .find(m => m.content && (m.content.includes('сгенерир') || m.content.includes('нарисуй') || m.content.includes('создай')));
                
                if (lastImageGeneration) {
                    // Check if current prompt is a modification request
                    const isModification = /оставь|убери|добавь|измени|сделай|только|без/.test(prompt.toLowerCase());
                    
                    if (isModification) {
                        // Combine context: take base from previous request + current modification
                        contextualPrompt = `${lastImageGeneration.content}, ${prompt}`;
                        console.log('📝 Using context from previous request');
                        console.log('   Previous:', lastImageGeneration.content);
                        console.log('   Current:', prompt);
                        console.log('   Combined:', contextualPrompt);
                    }
                }
            }
        }
        
        let imageBase64, modelName;
        
        // Choose provider
        if (provider === 'huggingface' || provider === 'stable-diffusion') {
            console.log('🎨 Generating image with Stable Diffusion 2.1:', contextualPrompt);
            
            // Use Hugging Face Inference API (Free, No API Key!)
            const hfResponse = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: contextualPrompt,
                    parameters: {
                        num_inference_steps: 30,
                        guidance_scale: 7.5
                    }
                })
            });
            
            if (!hfResponse.ok) {
                const errorText = await hfResponse.text();
                console.error('Hugging Face API error:', hfResponse.status, errorText);
                
                // Fallback to Pollinations if HF fails
                console.log('⚠️ Falling back to Pollinations AI');
                const encodedPrompt = encodeURIComponent(contextualPrompt);
                const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&enhance=true&nologo=true`;
                const pollResponse = await fetch(imageUrl);
                const pollBuffer = await pollResponse.arrayBuffer();
                imageBase64 = Buffer.from(pollBuffer).toString('base64');
                modelName = 'Pollinations AI (Flux) - Fallback';
            } else {
                const imageBuffer = await hfResponse.arrayBuffer();
                imageBase64 = Buffer.from(imageBuffer).toString('base64');
                modelName = 'Stable Diffusion 2.1';
            }
        } else {
            // Default: Pollinations AI
            console.log('🎨 Generating image with Pollinations AI:', contextualPrompt);
            
            const encodedPrompt = encodeURIComponent(contextualPrompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&enhance=true&nologo=true`;
            
            const response = await fetch(imageUrl);
            
            if (!response.ok) {
                console.error('Pollinations AI error:', response.status);
                return res.status(response.status).json({ 
                    error: 'Image generation failed',
                    details: `HTTP ${response.status}`
                });
            }
            
            const imageBuffer = await response.arrayBuffer();
            imageBase64 = Buffer.from(imageBuffer).toString('base64');
            modelName = 'Pollinations AI (Flux)';
        }
        
        console.log('✅ Image generated successfully');
        
        res.json({
            image: `data:image/png;base64,${imageBase64}`,
            prompt: contextualPrompt,
            originalPrompt: prompt,
            model: modelName,
            provider: provider,
            width,
            height,
            contextUsed: contextualPrompt !== prompt
        });
    } catch (error) {
        console.error('❌ Generate image error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Generate video - BETA: Limited free options available
app.post('/api/generate/video', async (req, res) => {
    try {
        const { prompt, userId, chatId } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Prompt required' });
        }
        
        // Get chat context if chatId is provided
        let contextualPrompt = prompt;
        if (chatId && userId) {
            const db = await readDB();
            const chat = db.chats?.find(c => c.id === chatId && c.userId === userId);
            
            if (chat && chat.messages && chat.messages.length > 0) {
                // Find last video generation request in chat history
                const recentMessages = chat.messages.slice(-10); // Last 10 messages
                const lastVideoGeneration = recentMessages
                    .reverse()
                    .find(m => m.content && (m.content.includes('видео') || m.content.includes('video')));
                
                if (lastVideoGeneration) {
                    // Check if current prompt is a modification request
                    const isModification = /оставь|убери|добавь|измени|сделай|только|без/.test(prompt.toLowerCase());
                    
                    if (isModification) {
                        // Combine context: take base from previous request + current modification
                        contextualPrompt = `${lastVideoGeneration.content}, ${prompt}`;
                        console.log('📝 Using context from previous video request');
                        console.log('   Previous:', lastVideoGeneration.content);
                        console.log('   Current:', prompt);
                        console.log('   Combined:', contextualPrompt);
                    }
                }
            }
        }
        
        console.log('🎥 Generating animated GIF (video simulation):', contextualPrompt);
        
        // Note: Free video generation APIs are very limited
        // For now, generate a high-quality animated sequence using Stable Diffusion
        // This creates a static image as a placeholder until we integrate a real video API
        
        const encodedPrompt = encodeURIComponent(contextualPrompt + ', cinematic, motion blur, dynamic');
        
        // Try Hugging Face first for better quality
        let videoUrl;
        try {
            const hfResponse = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputs: contextualPrompt + ', cinematic scene, motion, dynamic',
                    parameters: { num_inference_steps: 30, guidance_scale: 7.5 }
                })
            });
            
            if (hfResponse.ok) {
                const imageBuffer = await hfResponse.arrayBuffer();
                const base64Image = Buffer.from(imageBuffer).toString('base64');
                videoUrl = `data:image/png;base64,${base64Image}`;
                console.log('✅ Generated cinematic image (video placeholder)');
            } else {
                throw new Error('HF API failed');
            }
        } catch (error) {
            // Fallback to Pollinations
            videoUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&enhance=true&nologo=true`;
            console.log('✅ Using Pollinations fallback');
        }
        
        res.json({
            video: videoUrl,
            prompt: contextualPrompt,
            originalPrompt: prompt,
            model: 'Stable Diffusion 2.1 (Cinematic Frame)',
            message: '⚠️ Note: True video generation requires paid APIs. This is a high-quality cinematic frame.',
            contextUsed: contextualPrompt !== prompt,
            isPlaceholder: true
        });
    } catch (error) {
        console.error('❌ Generate video error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message
        });
    }
});



// ==================== PUBLIC API FOR INTEGRATIONS ====================

// Middleware для проверки API ключа
const verifyApiKey = async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
        return res.status(401).json({ 
            error: 'API key required',
            message: 'Please provide API key in X-API-Key or Authorization header'
        });
    }
    
    try {
        const db = await readDB();
        const user = db.users?.find(u => u.apiKey === apiKey);
        
        if (!user) {
            return res.status(401).json({ 
                error: 'Invalid API key',
                message: 'The provided API key is invalid'
            });
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('API key verification error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Public API: Chat completions (OpenAI compatible)
app.post('/api/v1/chat/completions', verifyApiKey, async (req, res) => {
    try {
        const { messages, model = 'gpt-5', temperature = 0.7, max_tokens = 2000 } = req.body;
        
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ 
                error: 'Invalid request',
                message: 'messages array is required'
            });
        }
        
        // Use Clacky Proxy API
        const CLACKY_API_KEY = 'sk-SJeu29HwKbFU3Bx-ixW9oA';
        const CLACKY_PROXY_URL = 'https://proxy.clacky.ai/v1/chat/completions';
        
        const response = await fetch(CLACKY_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CLACKY_API_KEY}`
            },
            body: JSON.stringify({
                model: model,
                messages: messages,
                temperature: temperature,
                max_tokens: max_tokens
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Clacky API error:', response.status, errorText);
            return res.status(response.status).json({ 
                error: 'AI API failed',
                details: errorText
            });
        }
        
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Chat completions error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Public API: Image generation
app.post('/api/v1/images/generate', verifyApiKey, async (req, res) => {
    try {
        const { prompt, provider = 'pollinations', width = 1024, height = 1024 } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ 
                error: 'Invalid request',
                message: 'prompt is required'
            });
        }
        
        let imageBase64, modelName;
        
        if (provider === 'huggingface' || provider === 'stable-diffusion') {
            console.log('🎨 API: Generating with Stable Diffusion 2.1:', prompt);
            
            const hfResponse = await fetch('https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-2-1', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: { num_inference_steps: 30, guidance_scale: 7.5 }
                })
            });
            
            if (!hfResponse.ok) {
                // Fallback
                const encodedPrompt = encodeURIComponent(prompt);
                const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&enhance=true&nologo=true`;
                const pollResponse = await fetch(imageUrl);
                const pollBuffer = await pollResponse.arrayBuffer();
                imageBase64 = Buffer.from(pollBuffer).toString('base64');
                modelName = 'Pollinations AI (Fallback)';
            } else {
                const imageBuffer = await hfResponse.arrayBuffer();
                imageBase64 = Buffer.from(imageBuffer).toString('base64');
                modelName = 'Stable Diffusion 2.1';
            }
        } else {
            console.log('🎨 API: Generating with Pollinations AI:', prompt);
            
            const encodedPrompt = encodeURIComponent(prompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=flux&enhance=true&nologo=true`;
            const response = await fetch(imageUrl);
            const imageBuffer = await response.arrayBuffer();
            imageBase64 = Buffer.from(imageBuffer).toString('base64');
            modelName = 'Pollinations AI (Flux)';
        }
        
        res.json({
            created: Date.now(),
            data: [{
                url: `data:image/png;base64,${imageBase64}`,
                b64_json: imageBase64
            }],
            model: modelName,
            provider: provider
        });
    } catch (error) {
        console.error('Image generation API error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Public API: Video generation
app.post('/api/v1/videos/generate', verifyApiKey, async (req, res) => {
    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ 
                error: 'Invalid request',
                message: 'prompt is required'
            });
        }
        
        console.log('🎥 API: Generating video:', prompt);
        
        const encodedPrompt = encodeURIComponent(prompt);
        const videoUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&enhance=true&nologo=true&video=true`;
        
        res.json({
            created: Date.now(),
            data: [{
                url: videoUrl
            }],
            model: 'Pollinations AI Video'
        });
    } catch (error) {
        console.error('Video generation API error:', error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: error.message
        });
    }
});

// Public API: List available models
app.get('/api/v1/models', verifyApiKey, (req, res) => {
    res.json({
        data: [
            { id: 'gpt-5', name: 'GPT-5', type: 'text' },
            { id: 'gpt-5-pro', name: 'GPT-5 Pro', type: 'text' },
            { id: 'gpt-5-mini', name: 'GPT-5 Mini', type: 'text' },
            { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', type: 'text' },
            { id: 'claude-3.7-sonnet', name: 'Claude 3.7 Sonnet', type: 'text' },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', type: 'text' },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', type: 'text' },
            { id: 'deepseek-r1', name: 'DeepSeek R1', type: 'text' },
            { id: 'deepseek-chat', name: 'DeepSeek Chat', type: 'text' },
            { id: 'pollinations', name: 'Pollinations AI (Flux)', type: 'image' },
            { id: 'stable-diffusion-2-1', name: 'Stable Diffusion 2.1', type: 'image' },
            { id: 'pollinations-video', name: 'Pollinations Video', type: 'video' }
        ]
    });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Database: ${DB_PATH}`);
});
