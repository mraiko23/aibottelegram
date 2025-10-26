// Chat Application with Multi-Model AI Support and API Key Management

class ChatApp {
    constructor() {
        // API URL - same origin (backend and frontend on same port)
        this.API_URL = `${window.location.origin}/api`;
        console.log('ChatApp API URL:', this.API_URL);
        this.currentModel = 'gpt-5';
        this.messages = [];
        this.isTyping = false;
        this.attachedFiles = [];
        
        // Chat system
        this.currentChatId = null;
        this.chats = {};
        
        // User's API key (generated per user)
        this.userApiKey = this.getUserApiKey();
        
        // Initialize immediately - DOM should be ready when this is called
        this.setupEventListeners();
        this.autoResizeTextarea();
        this.displayApiKey();
        // Initialize chat system asynchronously
        this.initializeChatSystem().catch(error => {
            console.error('Failed to initialize chat system:', error);
            setTimeout(() => {
                this.showToast('Ошибка инициализации системы чатов. Проверьте подключение к серверу.', 'error', null, 6000);
            }, 500);
        });
    }

    setupEventListeners() {
        // Model selection
        const modelButtons = document.querySelectorAll('.model-btn');
        console.log('Found model buttons:', modelButtons.length);
        modelButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                console.log('Model clicked:', btn.dataset.model);
                this.selectModel(btn.dataset.model);
            });
        });

        // Send message
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                console.log('Send button clicked');
                this.sendMessage();
            });
        }

        // Enter to send (Shift+Enter for new line)
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        // File attachment
        const fileInput = document.getElementById('fileInput');
        const attachBtn = document.getElementById('attachBtn');
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                console.log('File selected');
                this.handleFileSelect(e);
            });
        }

        if (attachBtn) {
            attachBtn.addEventListener('click', () => {
                console.log('Attach button clicked');
                if (fileInput) {
                    fileInput.click();
                }
            });
        }

        // API Key actions
        const showApiBtn = document.getElementById('showApiBtn');
        if (showApiBtn) {
            showApiBtn.addEventListener('click', () => {
                console.log('Show API button clicked');
                this.showApiKeyModal();
            });
        }

        const copyApiBtn = document.getElementById('copyApiBtn');
        if (copyApiBtn) {
            copyApiBtn.addEventListener('click', () => {
                this.copyApiKey();
            });
        }

        const regenerateApiBtn = document.getElementById('regenerateApiBtn');
        if (regenerateApiBtn) {
            regenerateApiBtn.addEventListener('click', () => {
                this.regenerateApiKey();
            });
        }

        const closeModalBtn = document.getElementById('closeModalBtn');
        if (closeModalBtn) {
            closeModalBtn.addEventListener('click', () => {
                this.closeApiKeyModal();
            });
        }

        const apiModal = document.getElementById('apiModal');
        if (apiModal) {
            apiModal.addEventListener('click', (e) => {
                if (e.target.id === 'apiModal') {
                    this.closeApiKeyModal();
                }
            });
        }
        
        // New chat button
        const newChatBtn = document.getElementById('newChatBtn');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', async () => {
                try {
                    const title = `💬 Новый чат ${Object.keys(this.chats).length + 1}`;
                    console.log('Creating new chat:', title);
                    const newChatId = await this.createNewChat(title);
                    if (newChatId) {
                        console.log('Chat created:', newChatId);
                        // Сначала загрузить новый чат, только потом изменить currentChatId
                        await this.loadChat(newChatId);
                        this.renderChatList();
                        this.showToast('Чат успешно создан', 'success');
                    } else {
                        console.error('Failed to create chat: returned null');
                        this.showToast('Ошибка создания чата. Проверьте подключение к серверу.', 'error');
                    }
                } catch (error) {
                    console.error('Error creating chat:', error);
                    this.showToast('Ошибка создания чата: ' + error.message, 'error');
                }
            });
        }
        
        // Toggle chat sidebar for mobile
        const toggleChatSidebarBtn = document.getElementById('toggleChatSidebarBtn');
        if (toggleChatSidebarBtn) {
            toggleChatSidebarBtn.addEventListener('click', () => {
                const chatSidebar = document.querySelector('.chat-sidebar');
                const modelSidebar = document.querySelector('.sidebar');
                
                chatSidebar.classList.toggle('open');
                modelSidebar.classList.remove('open');
            });
        }
        
        // Toggle model sidebar for mobile
        const toggleModelSidebarBtn = document.getElementById('toggleModelSidebarBtn');
        if (toggleModelSidebarBtn) {
            toggleModelSidebarBtn.addEventListener('click', () => {
                const modelSidebar = document.querySelector('.sidebar');
                const chatSidebar = document.querySelector('.chat-sidebar');
                
                modelSidebar.classList.toggle('open');
                chatSidebar.classList.remove('open');
            });
        }
        
        // Close sidebars when clicking outside on mobile
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                const chatSidebar = document.querySelector('.chat-sidebar');
                const modelSidebar = document.querySelector('.sidebar');
                const toggleChatBtn = document.getElementById('toggleChatSidebarBtn');
                const toggleModelBtn = document.getElementById('toggleModelSidebarBtn');
                
                if (!chatSidebar.contains(e.target) && e.target !== toggleChatBtn && !toggleChatBtn.contains(e.target)) {
                    chatSidebar.classList.remove('open');
                }
                
                if (!modelSidebar.contains(e.target) && e.target !== toggleModelBtn && !toggleModelBtn.contains(e.target)) {
                    modelSidebar.classList.remove('open');
                }
            }
        });

        console.log('Event listeners setup complete');
    }

    selectModel(modelId) {
        this.currentModel = modelId;
        
        // Update UI
        document.querySelectorAll('.model-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const selectedBtn = document.querySelector(`[data-model="${modelId}"]`);
        selectedBtn.classList.add('active');
        
        // Update current model display
        const modelName = selectedBtn.querySelector('.model-name').textContent;
        document.getElementById('currentModelName').textContent = modelName;
        
        // Show toast notification
        this.showToast(`Модель изменена на ${modelName}`, 'info');
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        
        if ((!message && this.attachedFiles.length === 0) || this.isTyping) return;
        
        // Clear input
        input.value = '';
        input.style.height = 'auto';
        
        // Remove welcome message if exists
        const welcomeMsg = document.querySelector('.welcome-message');
        if (welcomeMsg) {
            welcomeMsg.remove();
        }
        
        // Save files before clearing
        const filesToSend = [...this.attachedFiles];
        
        // Add user message to UI (with files if attached)
        this.addMessage(message || 'Прикрепленные файлы', 'user', this.attachedFiles);
        
        // Clear attached files
        this.attachedFiles = [];
        this.updateFilePreview();
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Call API with message and files
            const response = await this.callAIAPI(message, filesToSend);
            
            // Remove typing indicator
            this.hideTypingIndicator();
            
            // Add AI response
            if (typeof response === 'object' && response.type === 'image') {
                // Image response
                this.addMessage('🎨 Изображение успешно сгенерировано:', 'ai', [], response.url);
            } else if (typeof response === 'object' && response.type === 'video') {
                // Video response
                this.addMessage('🎥 Видео успешно сгенерировано:', 'ai', [], null, response.url);
            } else {
                // Text response
                this.addMessage(response, 'ai');
            }
            
        } catch (error) {
            console.error('API Error:', error);
            this.hideTypingIndicator();
            this.addMessage('Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте снова.', 'ai');
        }
        
        // Save chat after message
        if (this.currentChatId && this.chats[this.currentChatId]) {
            console.log('[SAVE] Saving chat after message. Messages:', this.messages.length);
            this.chats[this.currentChatId].messages = this.messages;
            this.chats[this.currentChatId].model = this.currentModel;
            const saved = await this.updateChat(this.currentChatId, {
                messages: this.messages,
                model: this.currentModel
            });
            if (saved) {
                console.log('[SAVE] ✅ Chat saved successfully');
            } else {
                console.error('[SAVE] ❌ Failed to save chat');
            }
        } else {
            console.warn('[SAVE] ⚠️ Cannot save: currentChatId or chat not found');
        }
        
        // Focus back on input
        input.focus();
    }

    async callAIAPI(userMessage, files = []) {
        // Store user message with files info
        this.messages.push({
            type: 'user',
            text: userMessage,
            files: files,
            timestamp: new Date()
        });
        
        // Detect request type (text/image/video generation)
        const requestType = this.detectRequestType(userMessage);
        
        // Handle image generation requests
        if (requestType === 'image') {
            try {
                const imageUrl = await this.generateImage(userMessage);
                if (imageUrl) {
                    this.messages.push({
                        type: 'ai',
                        text: 'Изображение успешно сгенерировано:',
                        image: imageUrl,
                        timestamp: new Date()
                    });
                    return { type: 'image', url: imageUrl };
                }
            } catch (error) {
                console.error('Image generation failed:', error);
            }
        }
        
        // Handle video generation requests
        if (requestType === 'video') {
            try {
                const videoUrl = await this.generateVideo(userMessage);
                if (videoUrl) {
                    this.messages.push({
                        type: 'ai',
                        text: '🎥 Видео успешно сгенерировано:',
                        video: videoUrl,
                        timestamp: new Date()
                    });
                    return { type: 'video', url: videoUrl };
                }
            } catch (error) {
                console.error('Video generation failed:', error);
                const fallbackMessage = 'ℹ️ Генерация видео временно недоступна. Попробуйте генерацию изображений или задайте текстовый вопрос.';
                this.messages.push({
                    type: 'ai',
                    text: fallbackMessage,
                    timestamp: new Date()
                });
                return fallbackMessage;
            }
        }
        
        // Normal text conversation
        try {
            // Try Clacky Proxy API first (primary API)
            const response = await this.tryClackyProxyAPI(userMessage, files);
            if (response) {
                this.messages.push({
                    type: 'ai',
                    text: response,
                    timestamp: new Date()
                });
                return response;
            }
        } catch (error) {
            console.error('Clacky Proxy API failed:', error);
        }
        
        // Fallback to other APIs
        const fallbackApis = [
            () => this.tryOpenRouterAPI(userMessage, files),
            () => this.tryHuggingFaceAPI(userMessage)
        ];
        
        for (const apiCall of fallbackApis) {
            try {
                const response = await apiCall();
                if (response) {
                    this.messages.push({
                        type: 'ai',
                        text: response,
                        timestamp: new Date()
                    });
                    return response;
                }
            } catch (error) {
                console.log('Fallback API attempt failed, trying next...');
                continue;
            }
        }
        
        // All APIs failed, use smart fallback
        const fallbackResponse = this.generateSmartResponse(userMessage);
        this.messages.push({
            type: 'ai',
            text: fallbackResponse,
            timestamp: new Date()
        });
        return fallbackResponse;
    }
    
    async tryClackyProxyAPI(userMessage, files = []) {
        // Use Clacky's proxy API with the provided key
        const CLACKY_API_KEY = 'sk-SJeu29HwKbFU3Bx-ixW9oA';
        const CLACKY_PROXY_URL = 'https://proxy.clacky.ai/v1/chat/completions';
        
        // Prepare conversation history
        const conversationHistory = [];
        
        // Add system message with current date/time and search capabilities
        const systemMessage = this.getSystemMessage();
        conversationHistory.push({
            role: 'system',
            content: systemMessage
        });
        
        // Add previous messages (text only) - skip the last one as it will be added separately
        for (const msg of this.messages.slice(-10, -1)) {
            if (msg.files && msg.files.length > 0) {
                // Skip file content in history to save tokens
                conversationHistory.push({
                    role: msg.type === 'user' ? 'user' : 'assistant',
                    content: msg.text + ` [${msg.files.length} файл(ов) прикреплено]`
                });
            } else {
                conversationHistory.push({
                    role: msg.type === 'user' ? 'user' : 'assistant',
                    content: msg.text
                });
            }
        }
        
        // Add current user message
        const currentMsg = this.messages[this.messages.length - 1];
        if (currentMsg && currentMsg.type === 'user') {
            conversationHistory.push({
                role: 'user',
                content: currentMsg.text
            });
        }
        
        // If files are attached to current message, handle them
        if (files && files.length > 0) {
            try {
                // Convert files to base64
                const fileContents = await Promise.all(
                    files.map(file => this.fileToBase64(file))
                );
                
                // Create multimodal content for vision models
                const content = [];
                
                // Add text message
                if (userMessage) {
                    content.push({
                        type: 'text',
                        text: userMessage
                    });
                }
                
                // Add images
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const base64 = fileContents[i];
                    
                    if (file.type.startsWith('image/')) {
                        content.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${file.type};base64,${base64}`
                            }
                        });
                    } else {
                        // For non-image files, include as text description
                        content.push({
                            type: 'text',
                            text: `[Файл: ${file.name}, размер: ${this.formatFileSize(file.size)}, тип: ${file.type}]`
                        });
                    }
                }
                
                // Replace last message with multimodal content
                if (conversationHistory.length > 0) {
                    conversationHistory[conversationHistory.length - 1].content = content;
                }
            } catch (error) {
                console.error('Error processing files:', error);
                // Continue with text-only if file processing fails
            }
        }
        
        // Map our model IDs to Clacky proxy models
        const modelMap = {
            'gpt-5': 'gpt-5',
            'gpt-5-pro': 'gpt-5-pro',
            'gpt-5-mini': 'gpt-5-mini',
            'claude-sonnet-4': 'claude-sonnet-4',
            'claude-3.7-sonnet': 'claude-3.7-sonnet',
            'claude-3.7-sonnet-think': 'claude-3.7-sonnet-think',
            'gemini-2.5-pro': 'gemini-2.5-pro',
            'gemini-2.5-flash': 'gemini-2.5-flash',
            'deepseek-r1': 'deepseek-r1',
            'deepseek-chat': 'deepseek-chat',
            'deepseek-reasoner': 'deepseek-reasoner'
        };
        
        const modelId = modelMap[this.currentModel] || 'gpt-5';
        
        console.log(`Calling Clacky Proxy API with model: ${modelId}`, files.length > 0 ? `with ${files.length} file(s)` : '');
        
        const response = await fetch(CLACKY_PROXY_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CLACKY_API_KEY}`
            },
            body: JSON.stringify({
                model: modelId,
                messages: conversationHistory,
                temperature: 0.7,
                max_tokens: 30000
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Clacky API error:', response.status, errorText);
            return null;
        }
        
        const data = await response.json();
        console.log('Clacky API response:', data);
        
        if (data.choices && data.choices[0] && data.choices[0].message) {
            return data.choices[0].message.content;
        }
        
        return null;
    }
    
    // Helper function to convert file to base64
    async fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // Remove data URL prefix to get pure base64
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    
    async tryOpenRouterAPI(userMessage, files = []) {
        const storedKey = localStorage.getItem('openrouter_api_key');
        if (!storedKey) return null;
        
        const conversationHistory = [];
        
        // Add system message with current date/time
        const systemMessage = this.getSystemMessage();
        conversationHistory.push({
            role: 'system',
            content: systemMessage
        });
        
        // Add previous messages
        for (const msg of this.messages.slice(-10)) {
            if (msg.files && msg.files.length > 0) {
                conversationHistory.push({
                    role: msg.type === 'user' ? 'user' : 'assistant',
                    content: msg.text + ` [${msg.files.length} файл(ов) прикреплено]`
                });
            } else {
                conversationHistory.push({
                    role: msg.type === 'user' ? 'user' : 'assistant',
                    content: msg.text
                });
            }
        }
        
        // Handle files for current message
        if (files && files.length > 0) {
            try {
                const fileContents = await Promise.all(
                    files.map(file => this.fileToBase64(file))
                );
                
                const content = [];
                
                if (userMessage) {
                    content.push({
                        type: 'text',
                        text: userMessage
                    });
                }
                
                for (let i = 0; i < files.length; i++) {
                    const file = files[i];
                    const base64 = fileContents[i];
                    
                    if (file.type.startsWith('image/')) {
                        content.push({
                            type: 'image_url',
                            image_url: {
                                url: `data:${file.type};base64,${base64}`
                            }
                        });
                    }
                }
                
                if (conversationHistory.length > 0) {
                    conversationHistory[conversationHistory.length - 1].content = content;
                }
            } catch (error) {
                console.error('Error processing files for OpenRouter:', error);
            }
        }
        
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${storedKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'AI Chat Platform'
            },
            body: JSON.stringify({
                model: this.getOpenRouterModelId(this.currentModel),
                messages: conversationHistory,
                temperature: 0.7,
                max_tokens: 30000
            })
        });
        
        if (!response.ok) return null;
        const data = await response.json();
        return data.choices[0].message.content;
    }
    
    async tryHuggingFaceAPI(userMessage) {
        try {
            const response = await fetch('https://api-inference.huggingface.co/models/microsoft/DialoGPT-large', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: userMessage,
                    parameters: {
                        max_length: 500,
                        temperature: 0.7
                    }
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data && data[0] && data[0].generated_text) {
                    return data[0].generated_text;
                }
            }
        } catch (e) {
            return null;
        }
        return null;
    }
    
    getOpenRouterModelId(modelId) {
        const modelMap = {
            'gpt-5': 'openai/gpt-5',
            'gpt-5-pro': 'openai/gpt-5-pro',
            'claude-sonnet-4': 'anthropic/claude-sonnet-4',
            'claude-3.7-sonnet': 'anthropic/claude-3.7-sonnet',
            'gemini-2.5-pro': 'google/gemini-2.5-pro',
            'gemini-2.5-flash': 'google/gemini-2.5-flash',
            'deepseek-r1': 'deepseek/deepseek-r1',
            'deepseek-chat': 'deepseek/deepseek-chat'
        };
        return modelMap[modelId] || 'openai/gpt-5';
    }
    
    generateSmartResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        const modelName = this.getModelName();
        
        // Comprehensive response patterns
        const patterns = [
            {
                keywords: ['привет', 'здрав', 'hello', 'hi', 'добрый'],
                responses: [
                    `Здравствуйте! Я ${modelName}. Рад помочь вам с любыми вопросами. Чем могу быть полезен?`,
                    `Привет! Я ${modelName}, и готов помочь. Задавайте вопросы!`
                ]
            },
            {
                keywords: ['как дела', 'как ты', 'how are you'],
                responses: [
                    `Отлично! Я ${modelName} и всегда готов помочь. Какой у вас вопрос?`
                ]
            },
            {
                keywords: ['помо', 'можешь', 'can you', 'help'],
                responses: [
                    `Конечно могу! Я ${modelName} и специализируюсь на помощи в различных задачах: анализ, программирование, написание текстов и многом другом. Что вам нужно?`
                ]
            },
            {
                keywords: ['спасибо', 'благодар', 'thank'],
                responses: [
                    `Пожалуйста! Рад был помочь. Если есть ещё вопросы - спрашивайте!`
                ]
            },
            {
                keywords: ['что такое', 'расскажи', 'what is', 'tell me'],
                responses: [
                    `Я ${modelName} - продвинутая языковая модель. Могу помочь с анализом, ответами на вопросы, написанием кода и созданием контента. Уточните ваш вопрос, и я постараюсь помочь.`
                ]
            },
            {
                keywords: ['код', 'code', 'программ', 'program'],
                responses: [
                    `Я ${modelName} и отлично разбираюсь в программировании! Могу помочь с Python, JavaScript, C++, Java и другими языками. Опишите вашу задачу, и я помогу её решить.`
                ]
            },
            {
                keywords: ['ку', 'hi', 'hey'],
                responses: [
                    `Привет! Я ${modelName}. Чем могу помочь? Задавайте любые вопросы!`
                ]
            }
        ];
        
        // Find matching pattern
        for (const pattern of patterns) {
            if (pattern.keywords.some(keyword => lowerMessage.includes(keyword))) {
                const randomResponse = pattern.responses[Math.floor(Math.random() * pattern.responses.length)];
                return randomResponse;
            }
        }
        
        // Default response for unmatched queries
        return `Я ${modelName} и понял ваш вопрос: "${userMessage.substring(0, 100)}${userMessage.length > 100 ? '...' : ''}". \n\nВ данный момент все бесплатные AI модели полностью доступны через Clacky AI Proxy! Выберите любую модель слева:\n\n🚀 GPT-5, GPT-5 Pro - новейшие модели от OpenAI\n🧠 Claude Sonnet 4, Claude 3.7 - от Anthropic\n💎 Gemini 2.5 Pro/Flash - от Google\n🔬 DeepSeek R1, DeepSeek Chat - reasoning модели\n\nПопробуйте задать вопрос снова или переформулируйте его!`;
    }
    
    getModelName() {
        const names = {
            'gpt-5': 'GPT-5',
            'gpt-5-pro': 'GPT-5 Pro',
            'gpt-5-mini': 'GPT-5 Mini',
            'claude-sonnet-4': 'Claude Sonnet 4',
            'claude-3.7-sonnet': 'Claude 3.7 Sonnet',
            'claude-3.7-sonnet-think': 'Claude 3.7 Sonnet Think',
            'gemini-2.5-pro': 'Gemini 2.5 Pro',
            'gemini-2.5-flash': 'Gemini 2.5 Flash',
            'deepseek-r1': 'DeepSeek R1',
            'deepseek-chat': 'DeepSeek Chat',
            'deepseek-reasoner': 'DeepSeek Reasoner'
        };
        return names[this.currentModel] || 'AI Assistant';
    }
    
    // Detect request type (text, image, or video generation)
    detectRequestType(message) {
        const lowerMessage = message.toLowerCase();
        
        // Video generation keywords (check first - most specific)
        const videoKeywords = [
            'сгенерируй видео', 'создай видео', 'сделай видео',
            'generate video', 'create video', 'make video'
        ];
        
        // Check for video keywords first
        for (const keyword of videoKeywords) {
            if (lowerMessage.includes(keyword)) {
                return 'video';
            }
        }
        
        // Image generation patterns - require explicit image/picture words
        const imagePatterns = [
            // Русский язык - требуем явное упоминание картинки/изображения
            /\b(сгенерируй|сгенерируйте|нарисуй|нарисуйте|создай|создайте|сделай|сделайте)\s+(картинку|изображение|рисунок|фото|арт)/i,
            // Или отдельное слово "нарисуй" (всегда про изображение)
            /\b(нарисуй|нарисуйте|draw)\b/i,
            // English - require explicit image/picture words
            /\b(generate|create|make|draw)\s+(image|picture|photo|art|illustration)/i,
            // Standalone image words in context
            /\b(картинку|изображение)\b/i
        ];
        
        // Check for image patterns
        for (const pattern of imagePatterns) {
            if (pattern.test(lowerMessage)) {
                return 'image';
            }
        }
        
        return 'text';
    }
    
    // Generate image using Pollinations AI
    async generateImage(prompt) {
        try {
            // Extract actual prompt from user message
            const cleanPrompt = prompt
                .replace(/(сгенерируй|нарисуй|создай)\s*(картинку|изображение)?\s*/gi, '')
                .replace(/(generate|create|draw|make)\s*(image|picture)?\s*/gi, '')
                .trim();
            
            console.log('🎨 Generating image with Pollinations AI:', cleanPrompt);
            
            // Get current user ID
            const currentUser = JSON.parse(localStorage.getItem('ai_chat_current_user') || '{}');
            const userId = currentUser.username;
            
            // Call backend API to generate image with Pollinations AI
            const response = await fetch(`${this.API_URL}/generate/image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    prompt: cleanPrompt, 
                    width: 1024, 
                    height: 1024,
                    userId: userId,
                    chatId: this.currentChatId
                })
            });
            
            if (!response.ok) {
                console.error('Image generation API failed');
                return this.generateImageFallback(cleanPrompt);
            }
            
            const data = await response.json();
            console.log('✅ Image generated successfully');
            if (data.contextUsed) {
                console.log('✅ Context was used from previous request');
            }
            return data.image || data.imageUrl;
        } catch (error) {
            console.error('❌ Image generation error:', error);
            return this.generateImageFallback(prompt);
        }
    }
    
    // Generate video using Pollinations AI
    async generateVideo(prompt) {
        try {
            // Extract actual prompt from user message
            const cleanPrompt = prompt
                .replace(/(сгенерируй|создай)\s*видео\s*/gi, '')
                .replace(/(generate|create|make)\s*video\s*/gi, '')
                .trim();
            
            console.log('🎥 Generating video with Pollinations AI:', cleanPrompt);
            
            // Get current user ID
            const currentUser = JSON.parse(localStorage.getItem('ai_chat_current_user') || '{}');
            const userId = currentUser.username;
            
            // Call backend API to generate video
            const response = await fetch(`${this.API_URL}/generate/video`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    prompt: cleanPrompt,
                    userId: userId,
                    chatId: this.currentChatId
                })
            });
            
            if (!response.ok) {
                console.error('Video generation API failed');
                return null;
            }
            
            const data = await response.json();
            console.log('✅ Video generated successfully');
            if (data.contextUsed) {
                console.log('✅ Context was used from previous video request');
            }
            return data.video || data.videoUrl;
        } catch (error) {
            console.error('❌ Video generation error:', error);
            throw error;
        }
    }
    
    async generateImageFallback(prompt) {
        try {
            console.log('🎨 Using fallback image generation (Pollinations)');
            const encodedPrompt = encodeURIComponent(prompt);
            const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&model=flux&nologo=true&enhance=true`;
            
            // Pre-load image to verify it works
            await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = resolve;
                img.onerror = reject;
                img.src = imageUrl;
            });
            
            return imageUrl;
        } catch (error) {
            console.error('Fallback image generation also failed:', error);
            throw error;
        }
    }

    addMessage(text, type, files = [], imageUrl = null, videoUrl = null) {
        const messagesContainer = document.getElementById('messagesContainer');
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = type === 'user' ? '👤' : '🤖';
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        // Add files if present
        if (files.length > 0) {
            const filesDiv = document.createElement('div');
            filesDiv.className = 'message-files';
            files.forEach(file => {
                const fileChip = document.createElement('div');
                fileChip.className = 'file-chip';
                fileChip.innerHTML = `📎 ${file.name} (${this.formatFileSize(file.size)})`;
                filesDiv.appendChild(fileChip);
            });
            content.appendChild(filesDiv);
        }
        
        // Add text with markdown support
        if (text) {
            const text_div = document.createElement('div');
            text_div.className = 'message-text';
            
            // For AI messages, parse markdown and apply syntax highlighting
            if (type === 'ai') {
                text_div.innerHTML = this.parseMarkdown(text);
                // Apply syntax highlighting to code blocks
                text_div.querySelectorAll('pre code').forEach((block) => {
                    hljs.highlightElement(block);
                });
            } else {
                // For user messages, keep as plain text
                text_div.textContent = text;
            }
            
            content.appendChild(text_div);
        }
        
        // Add generated image if present
        if (imageUrl) {
            const imageDiv = document.createElement('div');
            imageDiv.className = 'generated-image';
            const img = document.createElement('img');
            img.src = imageUrl;
            img.alt = 'Generated Image';
            img.style.cursor = 'pointer';
            img.onclick = () => window.open(imageUrl, '_blank');
            imageDiv.appendChild(img);
            content.appendChild(imageDiv);
        }
        
        // Add generated video if present
        if (videoUrl) {
            const videoDiv = document.createElement('div');
            videoDiv.className = 'generated-video';
            const video = document.createElement('video');
            video.src = videoUrl;
            video.controls = true;
            video.autoplay = false;
            video.loop = true;
            videoDiv.appendChild(video);
            
            const downloadBtn = document.createElement('a');
            downloadBtn.href = videoUrl;
            downloadBtn.download = 'generated-video.mp4';
            downloadBtn.target = '_blank';
            downloadBtn.textContent = '📥 Скачать видео';
            downloadBtn.style.cssText = 'display: inline-block; margin-top: 0.5rem; padding: 0.5rem 1rem; background: var(--primary); color: white; border-radius: 8px; text-decoration: none; font-size: 0.9rem;';
            videoDiv.appendChild(downloadBtn);
            
            content.appendChild(videoDiv);
        }
        
        // Add action buttons
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        
        if (type === 'user') {
            // Copy button for user messages
            const copyBtn = document.createElement('button');
            copyBtn.className = 'message-action-btn copy';
            copyBtn.innerHTML = '📋';
            copyBtn.title = 'Копировать';
            copyBtn.onclick = () => this.copyMessageText(text);
            actionsDiv.appendChild(copyBtn);
        } else if (type === 'ai') {
            // Copy button for AI messages
            const copyBtn = document.createElement('button');
            copyBtn.className = 'message-action-btn copy';
            copyBtn.innerHTML = '📋';
            copyBtn.title = 'Копировать';
            copyBtn.onclick = () => this.copyMessageText(text);
            actionsDiv.appendChild(copyBtn);
            
            // Regenerate button for AI messages
            const regenBtn = document.createElement('button');
            regenBtn.className = 'message-action-btn regenerate';
            regenBtn.innerHTML = '🔄';
            regenBtn.title = 'Перегенерировать';
            regenBtn.onclick = () => this.regenerateResponse();
            actionsDiv.appendChild(regenBtn);
        }
        
        content.appendChild(actionsDiv);
        
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
        
        messagesContainer.appendChild(messageDiv);
        
        // Scroll to bottom
        this.scrollToBottom();
    }

    addSystemMessage(text) {
        const messagesContainer = document.getElementById('messagesContainer');
        
        const messageDiv = document.createElement('div');
        messageDiv.style.cssText = 'text-align: center; color: var(--text-secondary); font-size: 0.85rem; margin: 1rem 0; opacity: 0.7;';
        messageDiv.textContent = text;
        
        messagesContainer.appendChild(messageDiv);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        this.isTyping = true;
        document.getElementById('sendBtn').disabled = true;
        
        const messagesContainer = document.getElementById('messagesContainer');
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message ai';
        typingDiv.id = 'typingIndicator';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = '🤖';
        
        const content = document.createElement('div');
        content.className = 'message-content';
        
        const typingAnimation = document.createElement('div');
        typingAnimation.className = 'message-typing';
        typingAnimation.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';
        
        content.appendChild(typingAnimation);
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(content);
        
        messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.isTyping = false;
        document.getElementById('sendBtn').disabled = false;
        
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    autoResizeTextarea() {
        const textarea = document.getElementById('messageInput');
        if (textarea) {
            textarea.addEventListener('input', function() {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 150) + 'px';
            });
        }
    }

    handleFileSelect(event) {
        const files = Array.from(event.target.files);
        this.attachedFiles = [...this.attachedFiles, ...files];
        this.updateFilePreview();
        event.target.value = ''; // Reset input
    }

    updateFilePreview() {
        const preview = document.getElementById('filePreview');
        if (this.attachedFiles.length === 0) {
            preview.innerHTML = '';
            preview.style.display = 'none';
            return;
        }
        
        preview.style.display = 'flex';
        preview.innerHTML = this.attachedFiles.map((file, index) => `
            <div class="file-chip">
                📎 ${file.name} (${this.formatFileSize(file.size)})
                <button class="remove-file" onclick="window.chatApp.removeFile(${index})">&times;</button>
            </div>
        `).join('');
    }

    removeFile(index) {
        this.attachedFiles.splice(index, 1);
        this.updateFilePreview();
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    // Parse markdown text with code highlighting
    parseMarkdown(text) {
        if (!text) return '';
        
        // Pre-process: Wrap code-like blocks that aren't in markdown
        // Обнаруживаем блоки кода без markdown оформления
        text = this.autoDetectCodeBlocks(text);
        
        // Configure marked options
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,
                gfm: true
            });
            
            // Custom renderer for code blocks
            const renderer = new marked.Renderer();
            const originalCode = renderer.code.bind(renderer);
            
            // Custom inline code renderer
            renderer.codespan = (code) => {
                return `<code class="inline-code">${this.escapeHtml(code)}</code>`;
            };
            
            renderer.code = (code, language) => {
                const validLanguage = language || 'plaintext';
                const copyId = 'copy-' + Math.random().toString(36).substr(2, 9);
                
                return `
                    <div class="code-block-wrapper">
                        <div class="code-block-header">
                            <span class="code-language">${validLanguage}</span>
                            <button class="code-copy-btn" onclick="window.chatApp.copyCode('${copyId}')" title="Копировать код">
                                <span>📋</span>
                                <span class="copy-text">Копировать</span>
                            </button>
                        </div>
                        <div class="code-block-content">
                            <pre><code id="${copyId}" class="language-${validLanguage}">${this.escapeHtml(code)}</code></pre>
                        </div>
                    </div>
                `;
            };
            
            marked.use({ renderer });
            
            try {
                return marked.parse(text);
            } catch (e) {
                console.error('Markdown parsing error:', e);
                return text.replace(/\n/g, '<br>');
            }
        }
        
        // Fallback if marked is not loaded
        return text.replace(/\n/g, '<br>');
    }
    
    // Auto-detect and wrap code blocks that aren't in markdown format
    autoDetectCodeBlocks(text) {
        // Разбиваем текст на блоки, сохраняя существующие markdown блоки
        const lines = text.split('\n');
        const result = [];
        let inMarkdownBlock = false;
        let inCodeBlock = false;
        let codeBuffer = [];
        let codeLanguage = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            
            // Проверяем markdown блоки
            if (trimmed.startsWith('```')) {
                inMarkdownBlock = !inMarkdownBlock;
                result.push(line);
                continue;
            }
            
            // Если мы в markdown блоке, просто добавляем
            if (inMarkdownBlock) {
                result.push(line);
                continue;
            }
            
            // Автоопределение кода: признаки кодовой строки
            const isCodeLine = this.looksLikeCode(line);
            
            if (isCodeLine && !inCodeBlock) {
                // Начало кодового блока
                inCodeBlock = true;
                codeLanguage = this.detectLanguage(line);
                codeBuffer = [line];
            } else if (inCodeBlock && (isCodeLine || trimmed === '')) {
                // Продолжение кодового блока (или пустая строка внутри)
                codeBuffer.push(line);
            } else if (inCodeBlock && !isCodeLine) {
                // Конец кодового блока
                if (codeBuffer.length >= 2) { // Минимум 2 строки для блока
                    result.push('```' + codeLanguage);
                    result.push(...codeBuffer);
                    result.push('```');
                } else {
                    result.push(...codeBuffer);
                }
                codeBuffer = [];
                inCodeBlock = false;
                codeLanguage = null;
                result.push(line);
            } else {
                // Обычная строка
                result.push(line);
            }
        }
        
        // Закрываем оставшийся кодовый блок
        if (inCodeBlock && codeBuffer.length >= 2) {
            result.push('```' + codeLanguage);
            result.push(...codeBuffer);
            result.push('```');
        } else if (codeBuffer.length > 0) {
            result.push(...codeBuffer);
        }
        
        return result.join('\n');
    }
    
    // Check if a line looks like code
    looksLikeCode(line) {
        const trimmed = line.trim();
        if (trimmed === '') return false;
        
        // Признаки кода
        const codePatterns = [
            /^(function|const|let|var|class|import|export|from|def|public|private|protected)\s/,
            /^(if|else|for|while|switch|case|return|break|continue)\s*[\(\{]/,
            /[\{\}\[\];]/,  // Скобки и точка с запятой
            /^\s{4,}/, // Сильный отступ
            /^\t/, // Табуляция
            /=>|===|!==|&&|\|\|/, // Операторы JS
            /\w+\([^)]*\)\s*\{/, // Функции
            /^<\w+[^>]*>/, // HTML теги
            /^#include|^using namespace/, // C/C++
            /@Override|@Autowired/, // Java annotations
        ];
        
        return codePatterns.some(pattern => pattern.test(trimmed));
    }
    
    // Detect programming language from code
    detectLanguage(line) {
        const trimmed = line.trim().toLowerCase();
        
        // JavaScript/TypeScript
        if (/\b(const|let|var|function|=>|import.*from)\b/.test(trimmed)) return 'javascript';
        
        // Python
        if (/^(def|class|import|from.*import|if __name__)/.test(trimmed)) return 'python';
        
        // HTML
        if (/^<!DOCTYPE|^<html|^<div|^<span/.test(trimmed)) return 'html';
        
        // CSS
        if (/\{$|^\.|^#\w+\s*\{/.test(trimmed)) return 'css';
        
        // Java
        if (/^(public|private|protected)\s+(class|interface|enum)/.test(trimmed)) return 'java';
        
        // C/C++
        if (/^#include|^using namespace/.test(trimmed)) return 'cpp';
        
        // SQL
        if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP)\b/i.test(trimmed)) return 'sql';
        
        return 'plaintext';
    }
    
    // Escape HTML to prevent XSS
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Get system message with current date/time and search capabilities
    getSystemMessage() {
        const now = new Date();
        const dateStr = now.toLocaleDateString('ru-RU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
        
        return `You are a helpful AI assistant with access to real-time information.

Current date and time: ${dateStr}, ${timeStr}
Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}

When users ask about:
- Current time, date, or day of the week - use the information provided above
- Recent events, news, or current information - acknowledge that you have knowledge cutoff but provide the most recent information you have
- Weather, stock prices, or other real-time data - explain that you don't have direct access to this data but can provide general information

Always be helpful, accurate, and honest about your capabilities and limitations.`;
    }
    
    // Copy code from code block
    copyCode(codeId) {
        const codeElement = document.getElementById(codeId);
        if (!codeElement) return;
        
        const code = codeElement.textContent;
        
        navigator.clipboard.writeText(code).then(() => {
            // Find the button
            const wrapper = codeElement.closest('.code-block-wrapper');
            const btn = wrapper.querySelector('.code-copy-btn');
            const copyText = btn.querySelector('.copy-text');
            
            // Update button state
            btn.classList.add('copied');
            copyText.textContent = 'Скопировано';
            
            // Reset after 2 seconds
            setTimeout(() => {
                btn.classList.remove('copied');
                copyText.textContent = 'Копировать';
            }, 2000);
            
            this.showToast('Код скопирован', 'success', null, 2000);
        }).catch(err => {
            console.error('Failed to copy code:', err);
            this.showToast('Ошибка копирования', 'error');
        });
    }
    
    // Copy message text to clipboard
    copyMessageText(text) {
        if (!text) return;
        
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('Текст скопирован', 'success', null, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            this.showToast('Ошибка копирования', 'error');
        });
    }
    
    // Regenerate AI response
    async regenerateResponse() {
        if (this.messages.length < 2) {
            this.showToast('Нет сообщений для регенерации', 'warning');
            return;
        }
        
        // Find last user message
        let lastUserMessageIndex = -1;
        for (let i = this.messages.length - 1; i >= 0; i--) {
            if (this.messages[i].type === 'user') {
                lastUserMessageIndex = i;
                break;
            }
        }
        
        if (lastUserMessageIndex === -1) {
            this.showToast('Не найдено сообщение пользователя', 'error');
            return;
        }
        
        const lastUserMessage = this.messages[lastUserMessageIndex];
        
        // Remove all messages after last user message (including AI responses)
        this.messages = this.messages.slice(0, lastUserMessageIndex + 1);
        
        // Re-render messages
        this.renderMessages();
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Call API again with the user's message
            const response = await this.callAIAPI(lastUserMessage.text, lastUserMessage.files || []);
            
            // Remove typing indicator
            this.hideTypingIndicator();
            
            // Add AI response
            if (typeof response === 'object' && response.type === 'image') {
                this.addMessage('🎨 Изображение успешно сгенерировано:', 'ai', [], response.url);
            } else if (typeof response === 'object' && response.type === 'video') {
                this.addMessage('🎥 Видео успешно сгенерировано:', 'ai', [], null, response.url);
            } else {
                this.addMessage(response, 'ai');
            }
            
            // Save chat
            if (this.currentChatId && this.chats[this.currentChatId]) {
                this.chats[this.currentChatId].messages = this.messages;
                await this.updateChat(this.currentChatId, {
                    messages: this.messages
                });
            }
            
            this.showToast('Ответ регенерирован', 'success');
            
        } catch (error) {
            console.error('Regenerate error:', error);
            this.hideTypingIndicator();
            this.addMessage('Извините, произошла ошибка при регенерации.', 'ai');
        }
    }

    // API Key Management
    getUserApiKey() {
        const user = window.auth.getCurrentUser();
        if (!user) return null;
        
        const apiKeysStr = localStorage.getItem('ai_chat_api_keys');
        const apiKeys = apiKeysStr ? JSON.parse(apiKeysStr) : {};
        
        if (!apiKeys[user.id]) {
            apiKeys[user.id] = this.generateApiKey();
            localStorage.setItem('ai_chat_api_keys', JSON.stringify(apiKeys));
        }
        
        return apiKeys[user.id];
    }

    generateApiKey() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = 'sk-';
        for (let i = 0; i < 48; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return key;
    }

    displayApiKey() {
        // API key will be shown in modal
    }

    showApiKeyModal() {
        const apiKeyDisplay = document.getElementById('apiKeyDisplay');
        const apiModal = document.getElementById('apiModal');
        const openRouterKeyInput = document.getElementById('openRouterKeyInput');
        
        if (apiKeyDisplay && this.userApiKey) {
            apiKeyDisplay.value = this.userApiKey;
        }
        
        // Load stored OpenRouter key
        if (openRouterKeyInput) {
            const storedKey = localStorage.getItem('openrouter_api_key');
            if (storedKey) {
                openRouterKeyInput.value = storedKey;
            }
        }
        
        if (apiModal) {
            apiModal.classList.add('show');
        }
    }

    closeApiKeyModal() {
        const apiModal = document.getElementById('apiModal');
        if (apiModal) {
            apiModal.classList.remove('show');
        }
    }

    copyApiKey() {
        const apiKeyInput = document.getElementById('apiKeyDisplay');
        apiKeyInput.select();
        document.execCommand('copy');
        
        const btn = document.getElementById('copyApiBtn');
        const originalText = btn.textContent;
        btn.textContent = '✓ Скопировано!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    }

    async regenerateApiKey() {
        const confirmed = await this.showConfirm(
            'Подтвердите действие',
            'Вы уверены, что хотите сгенерировать новый API ключ? Старый ключ перестанет работать.',
            'Сгенерировать',
            'warning'
        );
        
        if (!confirmed) {
            return;
        }
        
        const user = window.auth.getCurrentUser();
        const apiKeysStr = localStorage.getItem('ai_chat_api_keys');
        const apiKeys = apiKeysStr ? JSON.parse(apiKeysStr) : {};
        
        apiKeys[user.id] = this.generateApiKey();
        localStorage.setItem('ai_chat_api_keys', JSON.stringify(apiKeys));
        
        this.userApiKey = apiKeys[user.id];
        document.getElementById('apiKeyDisplay').value = this.userApiKey;
        
        this.showToast('Новый API ключ успешно сгенерирован', 'success');
    }

    // Chat System Methods
    async initializeChatSystem() {
        try {
            console.log('Initializing chat system...');
            // Load chats from backend
            this.chats = await this.loadChats();
            console.log('Loaded chats:', Object.keys(this.chats).length);
            
            // Create first chat if none exist
            if (Object.keys(this.chats).length === 0) {
                console.log('No chats found, creating first chat...');
                try {
                    this.currentChatId = await this.createNewChat('💬 Новый чат');
                    if (this.currentChatId) {
                        await this.loadChat(this.currentChatId);
                        console.log('First chat created and loaded successfully');
                    } else {
                        console.error('Failed to create first chat');
                    }
                } catch (error) {
                    console.error('Error creating first chat:', error);
                    // Don't throw, just log - user can create chat manually
                }
            } else {
                // Load last active chat
                const chatIds = Object.keys(this.chats);
                this.currentChatId = chatIds[chatIds.length - 1];
                console.log('Loading last active chat:', this.currentChatId);
                await this.loadChat(this.currentChatId);
            }
            
            // Render chat list
            this.renderChatList();
            console.log('Chat system initialized successfully');
        } catch (error) {
            console.error('Failed to initialize chat system:', error);
            throw error;
        }
    }
    
    async loadChats() {
        const user = window.auth?.getCurrentUser();
        if (!user) {
            console.warn('[LOAD] No user found, cannot load chats');
            return {};
        }
        
        try {
            console.log('[LOAD] Loading chats for user:', user.id);
            const response = await fetch(`${this.API_URL}/chats/${user.id}`);
            if (!response.ok) {
                console.error('[LOAD] Failed to load chats:', response.status);
                return {};
            }
            
            const chatsArray = await response.json();
            console.log('[LOAD] Received', chatsArray.length, 'chats from server');
            
            // Convert array to object with chatId as key
            const chatsObj = {};
            chatsArray.forEach(chat => {
                chatsObj[chat.id] = chat;
                console.log(`[LOAD] Chat ${chat.id}: "${chat.title}" with ${chat.messages?.length || 0} messages`);
            });
            return chatsObj;
        } catch (error) {
            console.error('[LOAD] Error loading chats:', error);
            return {};
        }
    }
    
    async saveChats() {
        const user = window.auth?.getCurrentUser();
        if (!user) return;
        
        // Save is now handled per-chat basis through updateChat
        // This method is kept for compatibility
    }
    
    async updateChat(chatId, updates) {
        try {
            console.log(`[SAVE] Updating chat ${chatId}:`, {
                messagesCount: updates.messages?.length,
                model: updates.model,
                title: updates.title
            });
            
            // Debug: Show stack trace if trying to save empty messages
            if (updates.messages !== undefined && updates.messages.length === 0) {
                console.warn('[SAVE] ⚠️ WARNING: Trying to save EMPTY messages array!');
                console.trace('[SAVE] Stack trace:');
            }
            
            const response = await fetch(`${this.API_URL}/chats/${chatId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });
            
            if (!response.ok) {
                console.error('Failed to update chat:', response.status, response.statusText);
                this.showToast('Ошибка сохранения чата', 'error');
                return false;
            }
            
            const updatedChat = await response.json();
            this.chats[chatId] = updatedChat;
            console.log(`[SAVE] Chat ${chatId} updated successfully. Total messages:`, updatedChat.messages?.length);
            return true;
        } catch (error) {
            console.error('Error updating chat:', error);
            this.showToast(`Ошибка сохранения: ${error.message}`, 'error');
            return false;
        }
    }
    
    async createNewChat(title = '💬 Новый чат') {
        const user = window.auth?.getCurrentUser();
        if (!user) {
            console.error('No user logged in');
            throw new Error('Пользователь не авторизован');
        }
        
        try {
            console.log('Creating chat for user:', user.id, 'title:', title);
            const response = await fetch(`${this.API_URL}/chats`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId: user.id,
                    title: title,
                    model: this.currentModel
                })
            });
            
            if (!response.ok) {
                const error = await response.text();
                console.error('Failed to create chat:', response.status, error);
                throw new Error(`Ошибка сервера: ${response.status}`);
            }
            
            const newChat = await response.json();
            console.log('Chat created successfully:', newChat);
            this.chats[newChat.id] = newChat;
            return newChat.id;
        } catch (error) {
            console.error('Error creating chat:', error);
            throw error;
        }
    }
    
    async loadChat(chatId) {
        if (!this.chats[chatId]) {
            console.error('[LOAD] Chat not found:', chatId);
            return;
        }
        
        console.log('[LOAD] Loading chat:', chatId);
        console.log('[LOAD] Current chat BEFORE switch:', this.currentChatId);
        console.log('[LOAD] Current messages count BEFORE switch:', this.messages.length);
        
        // Save current chat before switching (use OLD currentChatId)
        const oldChatId = this.currentChatId;
        if (oldChatId && oldChatId !== chatId && this.chats[oldChatId] && this.messages.length > 0) {
            console.log('[LOAD] Saving OLD chat before switch:', oldChatId, 'with', this.messages.length, 'messages');
            this.chats[oldChatId].messages = this.messages;
            this.chats[oldChatId].model = this.currentModel;
            await this.updateChat(oldChatId, {
                messages: this.messages,
                model: this.currentModel
            });
            console.log('[LOAD] ✅ Old chat saved successfully');
        } else if (oldChatId && oldChatId !== chatId) {
            console.log('[LOAD] Skipping save - messages array is empty, would erase data!');
        }
        
        // Load new chat
        this.currentChatId = chatId;
        this.messages = this.chats[chatId].messages || [];
        this.currentModel = this.chats[chatId].model || 'gpt-5';
        
        console.log('[LOAD] Loaded chat', chatId, 'with', this.messages.length, 'messages');
        console.log('[LOAD] Messages:', this.messages);
        
        // Update UI
        this.selectModel(this.currentModel);
        this.renderMessages();
        this.renderChatList();
    }
    
    renderMessages() {
        const messagesContainer = document.getElementById('messagesContainer');
        messagesContainer.innerHTML = '';
        
        if (this.messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="welcome-message">
                    <h2>💬 Добро пожаловать!</h2>
                    <p>Выберите модель слева и начните общение</p>
                    <p style="font-size: 0.9rem; color: var(--text-secondary); margin-top: 1rem;">
                        🎨 Можете генерировать изображения: "сгенерируй кота"<br>
                        🤖 Или просто задавайте вопросы AI
                    </p>
                </div>
            `;
            return;
        }
        
        // Render all messages
        this.messages.forEach(msg => {
            if (msg.type === 'user') {
                this.addMessage(msg.text, 'user', msg.files || []);
            } else {
                this.addMessage(msg.text, 'ai', [], msg.image || null, msg.video || null);
            }
        });
    }

    async clearChat() {
        this.messages = [];
        this.attachedFiles = [];
        this.updateFilePreview();
        
        if (this.currentChatId && this.chats[this.currentChatId]) {
            this.chats[this.currentChatId].messages = [];
            await this.updateChat(this.currentChatId, { messages: [] });
        }
        
        this.renderMessages();
    }
    
    renderChatList() {
        const chatList = document.getElementById('chatList');
        if (!chatList) return;
        
        chatList.innerHTML = '';
        
        const chatIds = Object.keys(this.chats).sort((a, b) => {
            return new Date(this.chats[b].createdAt) - new Date(this.chats[a].createdAt);
        });
        
        chatIds.forEach(chatId => {
            const chat = this.chats[chatId];
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            if (chatId === this.currentChatId) {
                chatItem.classList.add('active');
            }
            
            const date = new Date(chat.createdAt);
            const dateStr = date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
            
            chatItem.innerHTML = `
                <div class="chat-item-content">
                    <div class="chat-item-title">${chat.title}</div>
                    <div class="chat-item-date">${dateStr}</div>
                </div>
                <div class="chat-item-actions">
                    <button class="chat-item-btn rename" title="Переименовать">✏️</button>
                    <button class="chat-item-btn delete" title="Удалить">🗑️</button>
                </div>
            `;
            
            chatItem.addEventListener('click', async (e) => {
                if (!e.target.closest('.chat-item-btn')) {
                    await this.loadChat(chatId);
                    this.renderChatList();
                    
                    // Close sidebar on mobile after selecting
                    if (window.innerWidth <= 768) {
                        document.querySelector('.chat-sidebar').classList.remove('open');
                    }
                }
            });
            
            const renameBtn = chatItem.querySelector('.rename');
            renameBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.renameChat(chatId);
            });
            
            const deleteBtn = chatItem.querySelector('.delete');
            deleteBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                await this.deleteChat(chatId);
            });
            
            chatList.appendChild(chatItem);
        });
    }
    
    async renameChat(chatId) {
        const chat = this.chats[chatId];
        const newTitle = await this.showPrompt(
            'Переименовать чат',
            'Введите новое название чата:',
            chat.title
        );
        
        if (newTitle && newTitle.trim()) {
            chat.title = newTitle.trim();
            await this.updateChat(chatId, { title: newTitle.trim() });
            this.renderChatList();
            this.showToast('Чат переименован', 'success');
        }
    }
    
    async deleteChat(chatId) {
        const confirmed = await this.showConfirm(
            'Удалить чат',
            'Вы уверены, что хотите удалить этот чат? Это действие нельзя отменить.',
            'Удалить',
            'danger'
        );
        
        if (!confirmed) {
            return;
        }
        
        try {
            const response = await fetch(`${this.API_URL}/chats/${chatId}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) {
                console.error('Failed to delete chat');
                return;
            }
            
            delete this.chats[chatId];
            
            // If deleting current chat, switch to another or create new
            if (chatId === this.currentChatId) {
                const remainingChats = Object.keys(this.chats);
                if (remainingChats.length > 0) {
                    await this.loadChat(remainingChats[remainingChats.length - 1]);
                } else {
                    this.currentChatId = await this.createNewChat('💬 Новый чат');
                    await this.loadChat(this.currentChatId);
                }
            }
            
            this.renderChatList();
            this.showToast('Чат удален', 'success');
        } catch (error) {
            console.error('Error deleting chat:', error);
            this.showToast('Ошибка удаления чата', 'error');
        }
    }
    
    // Custom Confirm Dialog
    showConfirm(title, message, confirmText = 'Подтвердить', type = 'confirm') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'custom-dialog-overlay';
            
            const icons = {
                confirm: '❓',
                warning: '⚠️',
                danger: '🗑️'
            };
            
            overlay.innerHTML = `
                <div class="custom-dialog">
                    <div class="custom-dialog-title">
                        <span>${icons[type] || icons.confirm}</span>
                        <span>${title}</span>
                    </div>
                    <div class="custom-dialog-message">${message}</div>
                    <div class="custom-dialog-buttons">
                        <button class="custom-dialog-btn custom-dialog-btn-cancel" data-action="cancel">
                            Отмена
                        </button>
                        <button class="custom-dialog-btn custom-dialog-btn-${type === 'danger' ? 'danger' : 'confirm'}" data-action="confirm">
                            ${confirmText}
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            const handleClick = (e) => {
                const action = e.target.dataset.action;
                if (action === 'confirm') {
                    resolve(true);
                    document.body.removeChild(overlay);
                } else if (action === 'cancel' || e.target === overlay) {
                    resolve(false);
                    document.body.removeChild(overlay);
                }
            };
            
            overlay.addEventListener('click', handleClick);
            
            // Focus confirm button
            setTimeout(() => {
                const confirmBtn = overlay.querySelector('[data-action="confirm"]');
                if (confirmBtn) confirmBtn.focus();
            }, 100);
        });
    }
    
    // Custom Prompt Dialog
    showPrompt(title, message, defaultValue = '') {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'custom-dialog-overlay';
            
            overlay.innerHTML = `
                <div class="custom-dialog">
                    <div class="custom-dialog-title">
                        <span>✏️</span>
                        <span>${title}</span>
                    </div>
                    <div class="custom-dialog-message">${message}</div>
                    <input type="text" class="custom-dialog-input" value="${defaultValue}" />
                    <div class="custom-dialog-buttons">
                        <button class="custom-dialog-btn custom-dialog-btn-cancel" data-action="cancel">
                            Отмена
                        </button>
                        <button class="custom-dialog-btn custom-dialog-btn-confirm" data-action="confirm">
                            OK
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(overlay);
            
            const input = overlay.querySelector('.custom-dialog-input');
            
            const handleClick = (e) => {
                const action = e.target.dataset.action;
                if (action === 'confirm') {
                    resolve(input.value);
                    document.body.removeChild(overlay);
                } else if (action === 'cancel' || e.target === overlay) {
                    resolve(null);
                    document.body.removeChild(overlay);
                }
            };
            
            overlay.addEventListener('click', handleClick);
            
            // Handle Enter key
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    resolve(input.value);
                    document.body.removeChild(overlay);
                } else if (e.key === 'Escape') {
                    resolve(null);
                    document.body.removeChild(overlay);
                }
            });
            
            // Focus and select input
            setTimeout(() => {
                input.focus();
                input.select();
            }, 100);
        });
    }
    
    // Toast Notification System
    showToast(message, type = 'info', title = null, duration = 4000) {
        const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // Icons for different toast types
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        // Default titles
        const defaultTitles = {
            success: 'Успешно',
            error: 'Ошибка',
            warning: 'Внимание',
            info: 'Информация'
        };
        
        const toastTitle = title || defaultTitles[type] || defaultTitles.info;
        
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || icons.info}</div>
            <div class="toast-content">
                <div class="toast-title">${toastTitle}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close">×</button>
        `;
        
        // Add close button handler
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toast);
        });
        
        toastContainer.appendChild(toast);
        
        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.removeToast(toast);
            }, duration);
        }
        
        return toast;
    }
    
    removeToast(toast) {
        if (!toast || !toast.parentElement) return;
        
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 300);
    }
}

// ChatApp will be initialized by auth.js when user logs in
