// Authentication System with Telegram Mini App Support

class Auth {
    constructor() {
        // API URL - same origin (backend and frontend on same port)
        this.API_URL = `${window.location.origin}/api`;
        
        console.log('API URL:', this.API_URL);
        this.CURRENT_USER_KEY = 'ai_chat_current_user';
        this.SESSION_TOKEN_KEY = 'session_token';
        this.init();
    }

    async init() {
        // Setup event listeners first
        this.setupEventListeners();

        // Check for Telegram WebApp - must be synchronous check
        if (this.isTelegramWebApp()) {
            console.log('🔵 Telegram Mini App detected');
            
            // Проверяем существующую сессию СНАЧАЛА
            const existingSession = sessionStorage.getItem(this.SESSION_TOKEN_KEY);
            const existingUser = sessionStorage.getItem(this.CURRENT_USER_KEY);
            
            if (existingSession && existingUser) {
                console.log('✅ Found existing session, verifying...');
                const isValid = await this.verifySession(existingSession);
                
                if (isValid) {
                    console.log('✅ Existing session is valid, using it');
                    this.showChatInterface();
                    return;
                } else {
                    console.log('❌ Existing session expired, re-authenticating');
                    sessionStorage.removeItem(this.SESSION_TOKEN_KEY);
                    sessionStorage.removeItem(this.CURRENT_USER_KEY);
                }
            }
            
            // Только если нет сессии - создаем новую
            this.handleTelegramAuth();
        } else {
            console.log('🌐 Regular browser detected');
            this.checkAuthStatus();
        }
    }

    isTelegramWebApp() {
        return !!(window.Telegram?.WebApp?.initData && window.Telegram?.WebApp?.initDataUnsafe?.user);
    }

    async handleTelegramAuth() {
        // Show loading immediately
        this.showTelegramLoading();
        
        try {
            const webApp = window.Telegram.WebApp;
            const initData = webApp.initData;
            const user = webApp.initDataUnsafe.user;
            
            console.log('📱 Telegram user:', user.first_name, user.id, '(telegramId:', user.id, ')');
            
            // Expand WebApp
            webApp.expand();
            
            // Set theme
            if (webApp.backgroundColor) {
                document.body.style.backgroundColor = webApp.backgroundColor;
            }
            
            // Authenticate with backend (with timeout)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 sec timeout
            
            console.log('🔗 Sending auth request to server...');
            const response = await fetch(`${this.API_URL}/auth/telegram`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Auth failed');
            }
            
            const data = await response.json();
            console.log('👤 Authenticated as:', data.user.username, 'userId:', data.user.id);
            
            // Save session token in sessionStorage (cleared on tab close)
            sessionStorage.setItem(this.SESSION_TOKEN_KEY, data.sessionToken);
            sessionStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(data.user));
            
            console.log('✅ Telegram auth successful, session saved');
            
            // Show chat interface
            this.showChatInterface();
            
        } catch (error) {
            console.error('❌ Telegram auth error:', error);
            
            // Show error with retry button
            this.showTelegramError(error.message);
        }
    }

    showTelegramLoading() {
        const authContainer = document.getElementById('authContainer');
        authContainer.classList.remove('hidden');
        document.getElementById('chatContainer').classList.add('hidden');
        
        authContainer.innerHTML = `
            <div class="auth-card" style="text-align: center;">
                <h1 class="logo">AI Chat</h1>
                <p class="subtitle">Общайтесь с передовыми AI моделями</p>
                <div style="padding: 2rem 0;">
                    <div style="font-size: 3rem; margin-bottom: 1rem; animation: pulse 1.5s ease-in-out infinite;">
                        🔵
                    </div>
                    <h2 style="color: var(--text-primary); margin-bottom: 0.5rem;">Вход через Telegram</h2>
                    <p style="color: var(--text-secondary); font-size: 0.9rem;">Авторизация...</p>
                </div>
            </div>
            <style>
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.7; transform: scale(1.1); }
                }
            </style>
        `;
    }

    showTelegramError(errorMsg) {
        const authContainer = document.getElementById('authContainer');
        
        authContainer.innerHTML = `
            <div class="auth-card" style="text-align: center;">
                <h1 class="logo">AI Chat</h1>
                <p class="subtitle">Общайтесь с передовыми AI моделями</p>
                <div style="padding: 2rem 0;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">❌</div>
                    <h2 style="color: var(--error-color); margin-bottom: 0.5rem;">Ошибка авторизации</h2>
                    <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 1.5rem;">
                        ${errorMsg || 'Не удалось подключиться к серверу'}
                    </p>
                    <button id="retryTelegramAuth" class="btn btn-primary">
                        🔄 Попробовать снова
                    </button>
                </div>
            </div>
        `;
        
        // Add retry handler
        document.getElementById('retryTelegramAuth')?.addEventListener('click', () => {
            this.handleTelegramAuth();
        });
    }

    setupEventListeners() {
        // Form switching
        document.getElementById('showRegister')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegisterForm();
        });

        document.getElementById('showLogin')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginForm();
        });

        // Form submissions
        document.getElementById('loginForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        document.getElementById('registerForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Logout
        document.getElementById('logoutBtn')?.addEventListener('click', () => {
            this.logout();
        });
    }

    showRegisterForm() {
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('registerForm').classList.remove('hidden');
    }

    showLoginForm() {
        document.getElementById('registerForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
    }

    async handleRegister() {
        const username = document.getElementById('registerUsername').value.trim();
        const password = document.getElementById('registerPassword').value;
        const confirmPassword = document.getElementById('registerConfirmPassword').value;

        // Validation
        if (username.length < 3) {
            this.showToast('Имя пользователя должно быть не менее 3 символов', 'error');
            return;
        }

        if (password.length < 6) {
            this.showToast('Пароль должен быть не менее 6 символов', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showToast('Пароли не совпадают', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.API_URL}/auth/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                this.showToast(data.error || 'Ошибка регистрации', 'error');
                return;
            }

            this.showToast('Регистрация успешна! Войдите в систему', 'success');
            
            // Clear form and switch to login
            document.getElementById('registerForm').reset();
            setTimeout(() => {
                this.showLoginForm();
            }, 1500);
        } catch (error) {
            console.error('Register error:', error);
            this.showToast('Ошибка подключения к серверу', 'error');
        }
    }

    async handleLogin() {
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!username || !password) {
            this.showToast('Заполните все поля', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.API_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                this.showToast(data.error || 'Ошибка входа', 'error');
                return;
            }

            // Login successful - save session
            sessionStorage.setItem(this.SESSION_TOKEN_KEY, data.sessionToken);
            sessionStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(data.user));
            
            this.showChatInterface();
            document.getElementById('loginForm').reset();
        } catch (error) {
            console.error('Login error:', error);
            this.showToast('Ошибка подключения к серверу', 'error');
        }
    }

    logout() {
        sessionStorage.removeItem(this.CURRENT_USER_KEY);
        sessionStorage.removeItem(this.SESSION_TOKEN_KEY);
        this.showAuthInterface();
        
        // Clear chat if it exists
        if (window.chatApp) {
            window.chatApp = null;
        }
        
        // Close Telegram WebApp if it's active
        if (this.isTelegramWebApp()) {
            window.Telegram.WebApp.close();
        }
    }

    async verifySession(sessionToken) {
        try {
            const response = await fetch(`${this.API_URL}/auth/verify-session`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                return false;
            }
            
            const data = await response.json();
            
            if (data.valid) {
                // Update user data in sessionStorage
                sessionStorage.setItem(this.CURRENT_USER_KEY, JSON.stringify(data.user));
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Session verification error:', error);
            return false;
        }
    }
    
    async checkAuthStatus() {
        const sessionToken = sessionStorage.getItem(this.SESSION_TOKEN_KEY);
        
        if (sessionToken) {
            // Verify session with backend
            const isValid = await this.verifySession(sessionToken);
            
            if (isValid) {
                this.showChatInterface();
                return;
            } else {
                // Remove invalid session
                sessionStorage.removeItem(this.SESSION_TOKEN_KEY);
                sessionStorage.removeItem(this.CURRENT_USER_KEY);
            }
        }
        
        // No valid session
        this.showAuthInterface();
    }

    showAuthInterface() {
        document.getElementById('authContainer').classList.remove('hidden');
        document.getElementById('chatContainer').classList.add('hidden');
    }

    showChatInterface() {
        const user = this.getCurrentUser();
        if (user) {
            document.getElementById('authContainer').classList.add('hidden');
            document.getElementById('chatContainer').classList.remove('hidden');
            
            // Show user name (Telegram first name or username)
            const displayName = user.firstName || user.username || 'User';
            document.getElementById('userInfo').textContent = displayName;
            
            // Initialize chat app after a small delay to ensure DOM is ready
            setTimeout(() => {
                if (!window.chatApp) {
                    console.log('Initializing ChatApp...');
                    window.chatApp = new ChatApp();
                }
            }, 100);
        }
    }

    // Helper methods
    getCurrentUser() {
        const userStr = sessionStorage.getItem(this.CURRENT_USER_KEY);
        return userStr ? JSON.parse(userStr) : null;
    }

    getSessionToken() {
        return sessionStorage.getItem(this.SESSION_TOKEN_KEY);
    }

    showToast(message, type = 'info') {
        // Use ChatApp toast if available
        if (window.chatApp?.showToast) {
            window.chatApp.showToast(message, type);
        } else {
            // Fallback to creating toast directly
            const toastContainer = document.getElementById('toastContainer');
            if (!toastContainer) {
                console.log(message);
                return;
            }
            
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            
            const icons = {
                success: '✓',
                error: '✕',
                warning: '⚠',
                info: 'ℹ'
            };
            
            const defaultTitles = {
                success: 'Успешно',
                error: 'Ошибка',
                warning: 'Внимание',
                info: 'Информация'
            };
            
            toast.innerHTML = `
                <div class="toast-icon">${icons[type] || icons.info}</div>
                <div class="toast-content">
                    <div class="toast-title">${defaultTitles[type]}</div>
                    <div class="toast-message">${message}</div>
                </div>
                <button class="toast-close">×</button>
            `;
            
            toast.querySelector('.toast-close').addEventListener('click', () => {
                toast.classList.add('hiding');
                setTimeout(() => toast.remove(), 300);
            });
            
            toastContainer.appendChild(toast);
            
            setTimeout(() => {
                toast.classList.add('hiding');
                setTimeout(() => toast.remove(), 300);
            }, 4000);
        }
    }
}

// Initialize auth system
window.auth = new Auth();
