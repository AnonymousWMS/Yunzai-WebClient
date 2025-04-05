import WebSocket, { WebSocketServer } from 'ws';
import { ulid } from 'ulid';

// --- 添加预设 Token --- START ---
const SHARED_TOKEN = 'XdrlckdKIvTBGk4qxYopvAfgp4zMWpUR';
// --- 添加预设 Token --- END ---

// ... (if (!global.Bot) ...)
if (!global.Bot) {
  console.error('[WebChatAdapter] global.Bot is not defined. Adapter cannot function.');
}

// 仅在 Bot 对象存在时才定义和推送适配器
if (global.Bot && Bot.adapter) {
    Bot.adapter.push(new class WebChatAdapter {
        id = "WebChat";
        name = "WebChatAdapter";
        path = this.name;
        clients = new Map(); // Store connected clients: clientId -> ws
        clientContext = new Map(); // Store context for clients: clientId -> { user_id, nickname, isAuthenticated, etc. }
        wss = null; // WebSocket server instance
        self_id = null; // Bot's ID, set during connection/initialization
        botData = null; // Store Yunzai bot context

        constructor() {
            this.makeLog('info', `Initializing ${this.name}...`);
            this.initWebSocketServer();
        }

        makeLog(level, msg, userId = null) {
            if (Bot && Bot.makeLog) {
                Bot.makeLog(level, [`[${this.name}]`, ...Array.isArray(msg) ? msg : [msg]], userId || this.self_id);
            } else {
                console.log(`[${level.toUpperCase()}] [${this.name}] ${Array.isArray(msg) ? msg.join(' ') : msg}`);
            }
        }

        initWebSocketServer() {
            if (this.wss) {
                this.makeLog('warn', 'WebSocket server already initialized.');
                return;
            }
            try {
                this.wss = new WebSocketServer({ host: 'localhost', port: 2537, path: '/WebChat' });
                this.makeLog('info', `WebSocket server listening on ws://localhost:2537/WebChat`);

                this.wss.on('connection', (ws, req) => {
                    const clientId = ulid();
                    const remoteAddress = req.socket.remoteAddress;
                    // Initialize client context immediately upon connection
                    this.clients.set(clientId, ws);
                    this.clientContext.set(clientId, { remoteAddress, isAuthenticated: false }); // Default to not authenticated
                    this.makeLog('info', `Client connected: ${clientId} from ${remoteAddress}`);

                    ws.on('message', (message) => {
                        try {
                            const messageString = message.toString();
                            if (messageString.length > 10 * 1024) {
                                this.makeLog('warn', `Message from ${clientId} too large, discarding.`);
                                ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
                                return;
                            }
                            const data = JSON.parse(messageString);
                            this.makeLog('debug', `Received message from ${clientId}: ${messageString.substring(0, 200)}...`);
                            this.handleClientMessage(data, clientId, ws);
                        } catch (error) {
                            this.makeLog('error', [`Failed to parse message from ${clientId}: ${error}`, message.toString().substring(0, 100)]);
                            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format' }));
                        }
                    });

                    ws.on('close', (code, reason) => {
                         this.makeLog('info', `Client disconnected: ${clientId}. Code: ${code}, Reason: ${String(reason || 'N/A').substring(0,100)}`);
                        this.clients.delete(clientId);
                        this.clientContext.delete(clientId);
                    });

                    ws.on('error', (error) => {
                        this.makeLog('error', `WebSocket error for client ${clientId}: ${error}`);
                        if (this.clients.has(clientId)) {
                             this.clients.delete(clientId);
                             this.clientContext.delete(clientId);
                        }
                    });

                     ws.send(JSON.stringify({ type: 'connected', payload: { clientId: clientId, server: this.name } }));
                });

                 this.wss.on('error', (error) => {
                    this.makeLog('error', `WebSocket Server Error: ${error}`);
                    this.wss = null;
                 });

                 this.wss.on('close', () => {
                    this.makeLog('info', 'WebSocket Server Closed.');
                    this.wss = null;
                 });

            } catch (error) {
                this.makeLog('error', `Failed to initialize WebSocket server: ${error}`);
            }
        }

        // Handle messages FROM the client TO Yunzai
        handleClientMessage(data, clientId, ws) {
            const echo = data.echo;
            const currentContext = this.clientContext.get(clientId) || { isAuthenticated: false }; // Ensure context exists

            switch (data.type) {
                case 'auth':
                    const clientToken = data.payload?.token;
                    let isAuthenticated = false;
                    let authStatus = 'failed';
                    let authMessage = 'Invalid token';

                    if (clientToken && clientToken === SHARED_TOKEN) {
                        isAuthenticated = true;
                        authStatus = 'ok';
                        authMessage = 'Authentication successful';
                        this.makeLog('info', `Client ${clientId} authenticated successfully with token.`);
                    } else {
                        this.makeLog('warn', `Client ${clientId} authentication failed. Invalid or missing token.`);
                        // Optional: Close connection on failed auth after sending response
                        // setTimeout(() => ws.terminate(), 100);
                    }
                    // Update context with auth status and user info
                    this.clientContext.set(clientId, {
                        ...currentContext, // Preserve existing fields like remoteAddress
                        user_id: data.payload?.user_id || `web_${clientId.substring(0, 8)}`,
                        nickname: data.payload?.nickname || `WebChat User ${clientId.substring(0, 4)}`,
                        isAuthenticated: isAuthenticated,
                    });
                     // Send response regardless of success/failure
                     ws.send(JSON.stringify({ type: 'auth_response', echo, payload: { status: authStatus, message: authMessage } }));
                    break;

                 case 'message':
                    // Check authentication status before processing message
                     if (!currentContext.isAuthenticated) {
                         this.makeLog('warn', `Message from unauthenticated client ${clientId}, discarding.`);
                         ws.send(JSON.stringify({ type: 'error', echo, message: 'Authentication required' }));
                         return;
                     }
                    if (!data.payload || !data.payload.message) {
                        this.makeLog('warn', `Invalid message format from ${clientId}: Missing payload or message`);
                        ws.send(JSON.stringify({ type: 'error', echo, message: 'Invalid message format' }));
                        return;
                    }
                    this.processIncomingMessageEvent(data.payload, clientId);
                    // Send receipt only after successful processing attempt
                    ws.send(JSON.stringify({ type: 'message_receipt', echo, payload: { status: 'received' } }));
                    break;

                case 'api_call':
                     if (!currentContext.isAuthenticated) {
                         this.makeLog('warn', `API call from unauthenticated client ${clientId}, discarding.`);
                         ws.send(JSON.stringify({ type: 'error', echo, message: 'Authentication required' }));
                         return;
                     }
                    if (!data.payload || !data.payload.action) {
                        this.makeLog('warn', `Invalid api_call format from ${clientId}: Missing payload or action`);
                        ws.send(JSON.stringify({ type: 'error', echo, message: 'Invalid api_call format' }));
                        return;
                    }
                    this.handleApiCall(clientId, data.payload.action, data.payload.params, echo);
                    break;

                case 'heartbeat':
                    this.makeLog('debug', `Heartbeat received from ${clientId}`);
                    ws.send(JSON.stringify({ type: 'heartbeat_response', echo, payload: { timestamp: Date.now() } }));
                    break;

                default:
                    this.makeLog('warn', `Received unknown message type '${data.type}' from ${clientId}`);
                    ws.send(JSON.stringify({ type: 'error', echo, message: `Unknown message type: ${data.type}` }));
            }
        }

         // Process incoming message and dispatch as Yunzai event
         processIncomingMessageEvent(payload, clientId) {
            const clientInfo = this.clientContext.get(clientId) || {};
            const isAuthenticated = clientInfo.isAuthenticated || false;
            const userRole = isAuthenticated ? 'master' : 'guest'; // Assign role based on auth
            const isMaster = isAuthenticated;

            const user_id = clientInfo.user_id || `web_${clientId.substring(0, 8)}`;
            const nickname = clientInfo.nickname || `WebChat User ${clientId.substring(0, 4)}`;
            const message_type = payload.message_type || 'private';
            const raw_message = typeof payload.message === 'string' ? payload.message : JSON.stringify(payload.message);

            // Construct basic event data first
            const eventData = {
                adapter: this,
                self_id: this.self_id,
                post_type: "message",
                message_type: message_type,
                sub_type: payload.sub_type || (message_type === 'group' ? 'normal' : 'friend'),
                message_id: payload.message_id || ulid(),
                user_id: user_id,
                group_id: message_type === 'group' ? (payload.group_id || 'webchat_group') : undefined,
                seq: Date.now(),
                rand: Math.random(),
                font: "WebChat",
                raw_message: raw_message,
                message: this.parseMsg(payload.message),
                sender: {
                    user_id: user_id,
                    nickname: nickname,
                    card: message_type === 'group' ? (payload.sender?.card || nickname) : undefined,
                    role: userRole, // Add role based on auth
                },
                from_client_id: clientId,
                isMaster: isMaster, // Add isMaster flag
                toString: () => raw_message,
            };

            // --- 修改 makeForwardMsg 实现 --- START ---
            eventData.makeForwardMsg = async (msg) => {
                 this.makeLog('debug', `[makeForwardMsg stub] called with: ${JSON.stringify(msg).substring(0,100)}...`);
                 // Attempt to mimic the node structure Guoba might expect or pass to e.reply later
                 // This assumes msg is an array of messages to be put into nodes.
                 if (!Array.isArray(msg)) {
                     this.makeLog('warn', '[makeForwardMsg stub] Expected an array, received:', typeof msg);
                     return [{ // Return an array even for single item for consistency
                         user_id: this.self_id || Bot?.uin,
                         nickname: Bot?.nickname || "Bot",
                         message: this.parseMsg(msg) // Parse the single message
                     }];
                 }
                 const nodes = [];
                 for (const item of msg) {
                     const nodeUserId = item.user_id || this.self_id || Bot?.uin;
                     const nodeNickname = item.nickname || Bot?.nickname || "Bot"; // Use Bot nickname as seen in logs
                     const nodeMessage = item.message || '';
                     const parsedMessage = (typeof nodeMessage === 'string' || Array.isArray(nodeMessage))
                                          ? this.parseMsg(nodeMessage)
                                          : [{ type: 'text', text: '[未知节点内容]' }];
                     nodes.push({
                         user_id: nodeUserId,
                         nickname: nodeNickname,
                         message: parsedMessage
                     });
                 }
                 return nodes;
            };
            // --- 修改 makeForwardMsg 实现 --- END ---

            // Add methods that might reference eventData
            eventData.reply = async (msg, quote = false) => {
                // --- 回退：直接发送原始 msg，但保留返回 message_id --- START ---
                this.makeLog('debug', `[reply] Replying to ${clientId} with: ${JSON.stringify(msg).substring(0, 100)}...`);
                const messageToSend = msg; // Use the original msg directly

                const replyPayload = {
                    type: 'message',
                    payload: {
                        message: messageToSend,
                        reply_to_message_id: quote ? eventData.message_id : undefined,
                        context: {
                            message_type: eventData.message_type,
                            user_id: eventData.user_id,
                            group_id: eventData.group_id,
                        }
                    }
                };
                 // Return the result from sendMsgToClient (contains message_id)
                 const result = await this.sendMsgToClient(clientId, replyPayload);
                 return result;
                 // --- 回退：直接发送原始 msg，但保留返回 message_id --- END ---
            };
            eventData.recall = async () => {
                this.makeLog('warn', `[recall] Recall requested for message ${eventData.message_id} from ${clientId}`);
                this.sendMsgToClient(clientId, { type: 'notice', payload: { notice_type: 'recall_attempt', message_id: eventData.message_id } });
                return await this.recallMsg(eventData, eventData.message_id);
            };
             eventData.pickUser = (uid) => this.pickFriend(eventData, uid || user_id);
             eventData.pickMember = (gid, uid) => this.pickMember(eventData, gid || eventData.group_id, uid || user_id);
             eventData.pickGroup = (gid) => this.pickGroup(eventData, gid || eventData.group_id);
             eventData.bot = this.getBotApi(eventData);

            // Dispatch the event
            try {
                const eventName = `message.${message_type}`;
                if (Bot && Bot.em) {
                    Bot.em(eventName, eventData);
                    this.makeLog('info', `Dispatched '${eventName}' event from client ${clientId} (isMaster: ${isMaster})`);
                } else {
                    this.makeLog('error', `Bot.em not found, cannot dispatch event: ${eventName}`);
                }
            } catch (dispatchError) {
                this.makeLog('error', `Error dispatching '${eventName}' event for ${clientId}: ${dispatchError}`);
            }
         }

        // ... (rest of the adapter methods: handleApiCall, sendMsgToClient, broadcastMsg, sendMsg, etc.)
        async handleApiCall(clientId, action, params, echo = null) { /* ... */ }
        async sendMsgToClient(clientId, message) {
            if (this.clients.has(clientId)) {
                try {
                    const ws = this.clients.get(clientId);
                    // --- Generate and add message_id --- START ---
                    const messageId = ulid();
                    // Add message_id to the payload if it's a structured message
                    if (typeof message === 'object' && message !== null && message.payload) {
                        message.payload.message_id = messageId;
                    }
                    // --- Generate and add message_id --- END ---
                    ws.send(JSON.stringify(message));
                    this.makeLog('debug', `Sent message (ID: ${messageId}) to ${clientId}: ${JSON.stringify(message).substring(0, 100)}...`);
                    // --- Return result with message_id --- START ---
                    return { message_id: messageId, status: 'ok' };
                    // --- Return result with message_id --- END ---
                } catch (error) {
                    this.makeLog('error', `Failed to send message to ${clientId}: ${error}`);
                    return { message_id: null, status: 'failed', error: error };
                }
            } else {
                this.makeLog('warn', `Client ${clientId} not found, cannot send message.`);
                return { message_id: null, status: 'failed', error: 'Client not found' };
            }
        }
        async broadcastMsg(message) { /* ... */ }
        async sendMsg(data, msg) { /* ... */ }
        async getLoginInfo(data) { /* ... */ }
        parseMsg(msg) { /* ... */ }
        async recallMsg(data, message_id) { /* ... */ }
        async getMsg(data, message_id) { /* ... */ }
        async getFriendList(data) { /* ... */ }
        async getGroupList(data) { /* ... */ }
        async getMemberList(data, group_id) { /* ... */ }
        getBotApi(eventData) { /* ... */ }
        pickFriend(data, user_id) { /* ... */ }
        pickMember(data, group_id, user_id) { /* ... */ }
        pickGroup(data, group_id) { /* ... */ }
        async connect(botData) { /* ... */ }
        async load() { /* ... */ }
        async unload() { /* ... */ }

    }); // End of adapter class definition

    console.log('[WebChatAdapter] Adapter pushed to Bot.adapter.');

} else {
    console.error('[WebChatAdapter] Bot.adapter is not available. Adapter not loaded.');
} 