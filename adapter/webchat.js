import WebSocket, { WebSocketServer } from 'ws';
import { ulid } from 'ulid';

// 确保 Bot 对象可用，通常 Yunzai 会在加载插件时提供
if (!global.Bot) {
  console.error('[WebChatAdapter] global.Bot is not defined. Adapter cannot function.');
  // 可以选择抛出错误或进行其他处理
  // throw new Error('[WebChatAdapter] global.Bot is not defined.');
}

// 仅在 Bot 对象存在时才定义和推送适配器
if (global.Bot && Bot.adapter) {
    Bot.adapter.push(new class WebChatAdapter {
        id = "WebChat";
        name = "WebChatAdapter";
        path = this.name;
        clients = new Map(); // Store connected clients: clientId -> ws
        clientContext = new Map(); // Store context for clients: clientId -> { user_id, nickname, etc. }
        wss = null; // WebSocket server instance
        self_id = null; // Bot's ID, set during connection/initialization
        botData = null; // Store Yunzai bot context

        constructor() {
            this.makeLog('info', `Initializing ${this.name}...`);
            // 延迟初始化 WebSocket 服务器，可能等待 Yunzai 核心加载完成
            // 或者在 connect 方法中初始化
            // 暂时直接初始化
            this.initWebSocketServer();
        }

        makeLog(level, msg, userId = null) {
            // 确保 Bot.makeLog 可用
            if (Bot && Bot.makeLog) {
                Bot.makeLog(level, [`[${this.name}]`, ...Array.isArray(msg) ? msg : [msg]], userId || this.self_id);
            } else {
                // Fallback console log
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
                    this.clients.set(clientId, ws);
                    this.clientContext.set(clientId, { remoteAddress }); // Store basic context
                    this.makeLog('info', `Client connected: ${clientId} from ${remoteAddress}`);

                    ws.on('message', (message) => {
                        try {
                            const messageString = message.toString();
                            // Limit message size to prevent abuse
                            if (messageString.length > 10 * 1024) {
                                this.makeLog('warn', `Message from ${clientId} too large, discarding.`);
                                ws.send(JSON.stringify({ type: 'error', message: 'Message too large' }));
                                return;
                            }
                            const data = JSON.parse(messageString);
                            this.makeLog('debug', `Received message from ${clientId}: ${messageString}`);
                            this.handleClientMessage(data, clientId, ws);
                        } catch (error) {
                            this.makeLog('error', [`Failed to parse message from ${clientId}: ${error}`, message.toString().substring(0, 100)]);
                            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON format' }));
                        }
                    });

                    ws.on('close', (code, reason) => {
                        this.makeLog('info', `Client disconnected: ${clientId}. Code: ${code}, Reason: ${reason}`);
                        this.clients.delete(clientId);
                        this.clientContext.delete(clientId);
                        // Notify Yunzai about client disconnection if needed?
                    });

                    ws.on('error', (error) => {
                        this.makeLog('error', `WebSocket error for client ${clientId}: ${error}`);
                        // Ensure cleanup even if close event doesn't fire
                        if (this.clients.has(clientId)) {
                             this.clients.delete(clientId);
                             this.clientContext.delete(clientId);
                        }
                    });

                     // Send a connection confirmation to the client
                     ws.send(JSON.stringify({ type: 'connected', payload: { clientId: clientId, server: this.name } }));
                });

                this.wss.on('error', (error) => {
                    this.makeLog('error', `WebSocket Server Error: ${error}`);
                    this.wss = null; // Reset server instance on error
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
            // Expected format: { type: 'message' | 'api_call' | 'heartbeat' | 'auth', echo?: string, payload: any }
            const echo = data.echo; // For request-response matching

            switch (data.type) {
                case 'auth':
                    // Optional: Implement authentication/identification
                    // Store user info in this.clientContext
                    this.clientContext.set(clientId, {
                        ...this.clientContext.get(clientId),
                        user_id: data.payload?.user_id || `web_${clientId.substring(0, 8)}`,
                        nickname: data.payload?.nickname || `WebChat User ${clientId.substring(0, 4)}`,
                        // Add other relevant info
                    });
                    this.makeLog('info', `Client ${clientId} authenticated as ${this.clientContext.get(clientId)?.nickname}`);
                    ws.send(JSON.stringify({ type: 'auth_response', echo, payload: { status: 'ok' } }));
                    break;

                case 'message':
                    if (!data.payload || !data.payload.message) {
                        this.makeLog('warn', `Invalid message format from ${clientId}: Missing payload or message`);
                        ws.send(JSON.stringify({ type: 'error', echo, message: 'Invalid message format' }));
                        return;
                    }
                    this.processIncomingMessageEvent(data.payload, clientId);
                    // Acknowledge receipt (optional)
                    ws.send(JSON.stringify({ type: 'message_receipt', echo, payload: { status: 'received' } }));
                    break;

                case 'api_call':
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
            const user_id = clientInfo.user_id || `web_${clientId.substring(0, 8)}`;
            const nickname = clientInfo.nickname || `WebChat User ${clientId.substring(0, 4)}`;
            const message_type = payload.message_type || 'private'; // Assume private unless specified (e.g., 'private', 'group')
            const raw_message = typeof payload.message === 'string' ? payload.message : JSON.stringify(payload.message);

            // Construct the basic event object first
            const eventData = {
                adapter: this,
                self_id: this.self_id, // Bot's ID
                post_type: "message",
                message_type: message_type,
                sub_type: payload.sub_type || (message_type === 'group' ? 'normal' : 'friend'), // Guess sub_type
                message_id: payload.message_id || ulid(), // Use client's ID or generate one
                user_id: user_id,
                group_id: message_type === 'group' ? (payload.group_id || 'webchat_group') : undefined,
                // guild_id, channel_id can be added if needed
                seq: Date.now(),
                rand: Math.random(),
                font: "WebChat",
                raw_message: raw_message,
                message: this.parseMsg(payload.message), // Parse into segments
                sender: {
                    user_id: user_id,
                    nickname: nickname,
                    card: message_type === 'group' ? (payload.sender?.card || nickname) : undefined,
                    // Add other sender fields if provided by client
                },
                // Store client ID for potential replies
                from_client_id: clientId,
                toString: () => raw_message, // toString can be defined early
            };

            // Now add methods that might reference eventData itself
            eventData.reply = (msg, quote = false) => { // Add quote capability if needed
                this.makeLog('debug', `[reply] Replying to ${clientId}`);
                const replyPayload = {
                    type: 'message',
                    payload: {
                        message: msg,
                        // Add context about the reply target if needed by client
                        reply_to_message_id: quote ? eventData.message_id : undefined,
                        context: {
                            message_type: eventData.message_type,
                            user_id: eventData.user_id,
                            group_id: eventData.group_id,
                        }
                    }
                };
                return this.sendMsgToClient(clientId, replyPayload);
            };
            eventData.recall = async () => {
                 this.makeLog('warn', `[recall] Recall requested for message ${eventData.message_id} from ${clientId}`);
                 // Notify client about recall attempt
                this.sendMsgToClient(clientId, { type: 'notice', payload: { notice_type: 'recall_attempt', message_id: eventData.message_id } });
                return await this.recallMsg(eventData, eventData.message_id); // Use adapter's recallMsg
            };
            eventData.makeForwardMsg = async (msg) => {
                 this.makeLog('warn', `[makeForwardMsg] Not implemented for WebChat adapter.`);
                 // Could potentially structure a forward message format for the client
                 return { type: 'forward', payload: msg };
            };
            eventData.getAvatarUrl = async () => {
                this.makeLog('debug', '[getAvatarUrl] Returning empty URL.');
                return ''; // No standard avatar concept
            };
            eventData.pickUser = (uid) => this.pickFriend(eventData, uid || user_id);
            eventData.pickMember = (gid, uid) => this.pickMember(eventData, gid || eventData.group_id, uid || user_id);
            eventData.pickGroup = (gid) => this.pickGroup(eventData, gid || eventData.group_id);
            eventData.bot = this.getBotApi(eventData); // Provide a bot object with API methods

            // Dispatch the event
            try {
                const eventName = `message.${message_type}`;
                // Ensure Bot.em exists
                if (Bot && Bot.em) {
                    Bot.em(eventName, eventData);
                    this.makeLog('info', `Dispatched '${eventName}' event from client ${clientId}`);
                } else {
                    this.makeLog('error', `Bot.em not found, cannot dispatch event: ${eventName}`);
                }
            } catch (dispatchError) {
                this.makeLog('error', `Error dispatching '${eventName}' event for ${clientId}: ${dispatchError}`);
            }
         }


        // Handle API calls FROM the client (or internal calls like from Yunzai)
        async handleApiCall(clientId, action, params, echo = null) {
            this.makeLog('info', `Handling API call from ${clientId === 'YunzaiInternal' ? 'Yunzai' : `client ${clientId}`}: action=${action}, params=${JSON.stringify(params)}`);
            const clientWs = this.clients.get(clientId);
            let response = { status: 'failed', data: null, message: 'Not Implemented' };

            try {
                 // Use a helper to get the bot API context if needed
                 const botApiContext = this.getBotApi({ self_id: this.self_id, from_client_id: clientId });

                 switch (action) {
                    case 'send_msg':
                    case 'send_private_msg':
                    case 'send_group_msg':
                        // This adapter receives messages via websocket events,
                        // and sends messages *from* Yunzai *to* clients.
                        // An API call `send_msg` from the client should usually target Yunzai's *other* adapters,
                        // or be intended for *this* adapter to send back to the *same* or *another* web client.
                        // Let's assume this means "send this message via WebChat adapter".
                        const targetClientId = params?.client_id || params?.user_id || params?.group_id; // Allow targeting specific client/user/group
                        const messagePayload = {
                             type: 'message',
                             payload: { message: params.message, context: params }
                        };

                        if (targetClientId && this.clients.has(targetClientId)) {
                             // Send to specific client if ID matches a connected client
                             const result = await this.sendMsgToClient(targetClientId, messagePayload);
                             response = { status: result.error ? 'failed' : 'ok', data: result };
                        } else if (targetClientId) {
                            // Trying to target a specific user/group not directly mapped to a client ID
                             this.makeLog('warn', `API call '${action}' target '${targetClientId}' not found among connected clients. Broadcasting instead.`);
                            const results = await this.broadcastMsg(messagePayload); // Broadcast if target not found
                            response = { status: 'ok', data: { broadcast_results: results } }; // Indicate broadcast
                        }
                        else {
                            // No target specified, broadcast to all clients
                            this.makeLog('debug', `API call '${action}' with no target, broadcasting.`);
                             const results = await this.broadcastMsg(messagePayload);
                             response = { status: 'ok', data: { broadcast_results: results } };
                        }
                        break;

                    case 'get_login_info':
                         response = { status: 'ok', data: await this.getLoginInfo({ self_id: this.self_id }) };
                        break;

                    case 'get_client_list':
                         response = { status: 'ok', data: Array.from(this.clients.keys()).map(id => ({ clientId: id, ...this.clientContext.get(id) })) };
                        break;

                     case 'delete_msg':
                     case 'recall':
                         const recallResult = await this.recallMsg({ self_id: this.self_id, from_client_id: clientId }, params.message_id);
                         response = { status: recallResult ? 'ok' : 'failed', data: { recalled: recallResult } };
                         break;

                    // Add handlers for other relevant API actions...
                    // case 'get_friend_list':
                    //     response = { status: 'ok', data: await this.getFriendList({ self_id: this.self_id }) };
                    //     break;
                    // case 'get_group_list':
                    //     response = { status: 'ok', data: await this.getGroupList({ self_id: this.self_id }) };
                    //     break;

                    default:
                        response = { status: 'failed', message: `Action '${action}' not implemented` };
                        this.makeLog('warn', `Unhandled API action '${action}' from ${clientId}`);
                }
            } catch (error) {
                 this.makeLog('error', `Error processing API call ${action} for ${clientId}: ${error}`);
                response = { status: 'error', message: String(error.message || error) };
            }

            // Send response back to the client that made the API call, if it was a client and has an echo
            if (clientWs && echo) {
                 clientWs.send(JSON.stringify({ type: 'api_response', echo, payload: response }));
            } else if (clientId === 'YunzaiInternal') {
                 // If called internally, return the response directly
                 return response;
            }
            // If it was a client call without echo, we don't send back implicitly
        }

        // --- Methods for Yunzai to interact with this adapter ---

        // Send a message FROM Yunzai TO a specific client
        async sendMsgToClient(clientId, message) {
             const ws = this.clients.get(clientId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                 try {
                    const messageString = JSON.stringify(message);
                    ws.send(messageString);
                    this.makeLog('debug', `Sent message to client ${clientId}: ${messageString.substring(0, 200)}...`);
                    return { message_id: message.payload?.message_id || ulid() }; // Return a simulated message ID
                 } catch(error) {
                    this.makeLog('error', `Failed to send message to client ${clientId}: ${error}`);
                    // Attempt to close broken socket?
                    ws.terminate();
                    this.clients.delete(clientId);
                    this.clientContext.delete(clientId);
                    return { error: 'Failed to send' };
                 }
            } else {
                this.makeLog('warn', `Client ${clientId} not found or connection not open.`);
                 return { error: 'Client not connected' };
            }
        }

        // Send a message FROM Yunzai TO all connected clients (broadcast)
        async broadcastMsg(message) {
            this.makeLog('debug', `Broadcasting message to ${this.clients.size} clients: ${JSON.stringify(message).substring(0, 200)}...`);
            const results = [];
            const messageString = JSON.stringify(message);

            for (const [clientId, ws] of this.clients.entries()) {
                 if (ws.readyState === WebSocket.OPEN) {
                     try {
                         ws.send(messageString);
                         results.push({ clientId, status: 'ok', message_id: message.payload?.message_id || ulid() });
                     } catch(error) {
                         this.makeLog('error', `Failed to broadcast to client ${clientId}: ${error}`);
                         results.push({ clientId, status: 'error', error: String(error.message || error) });
                         // Attempt to close broken socket?
                         ws.terminate();
                         this.clients.delete(clientId);
                         this.clientContext.delete(clientId);
                     }
                 } else {
                     results.push({ clientId, status: 'error', error: 'Connection not open' });
                 }
            }
            return results; // Return status for each client
        }

         // --- Yunzai Adapter API Implementation ---

         /**
          * Called by Yunzai core to send a message through this adapter.
          * @param {object} data Context provided by Yunzai (self_id, message_type, user_id, group_id, etc.)
          * @param {string | Array} msg Message content (string or segments)
          */
         async sendMsg(data, msg) {
             this.makeLog('debug', `Adapter sendMsg called: Target=${data.to_id || data.user_id || data.group_id}, Type=${data.message_type}, ClientCtx=${data.from_client_id}`);

             // Construct the message payload for the client
             const messageToSend = {
                 type: 'message',
                 payload: {
                     message: msg, // Send raw message content from Yunzai for now
                     // Client should handle parsing/displaying Yunzai's segment format or simple strings
                     context: {
                         message_type: data.message_type,
                         user_id: data.user_id, // Target user/sender of original message
                         group_id: data.group_id, // Target group
                         sender_id: data.self_id, // Message is from the bot
                         // Add any other context the client might need
                         raw_data: data // Optionally include raw Yunzai context
                     },
                     message_id: ulid() // Generate a new ID for the outgoing message
                 }
             };

             // Determine target client(s)
             const targetClientId = data.from_client_id || data.to_id || data.user_id || data.group_id; // Use context, specific target, user, or group ID

             if (targetClientId && this.clients.has(targetClientId)) {
                 // If the target ID matches a connected client ID, send directly
                 this.makeLog('info', `Sending message via WebChat to specific client ${targetClientId}`);
                 return this.sendMsgToClient(targetClientId, messageToSend);
             } else if (data.message_type === 'private' && targetClientId) {
                 // If private message and target ID doesn't match a client ID, maybe find client by user_id context?
                 let foundClient = false;
                 for (const [cid, ctx] of this.clientContext.entries()) {
                     if (ctx.user_id === targetClientId) {
                         this.makeLog('info', `Sending private message via WebChat to client ${cid} matching user_id ${targetClientId}`);
                         foundClient = true;
                         return this.sendMsgToClient(cid, messageToSend);
                         // break; // Assuming one client per user_id for now
                     }
                 }
                 if (!foundClient) {
                    this.makeLog('warn', `Private message target user_id '${targetClientId}' not found among connected clients. Cannot send.`);
                    return { error: 'Target client not found' };
                 }
             }
             else {
                 // If no specific client context, or it's a group message without a specific target client, broadcast.
                 this.makeLog('info', `Broadcasting message via WebChat (Type: ${data.message_type}, Target: ${targetClientId || 'N/A'})`);
                 return this.broadcastMsg(messageToSend);
             }
         }

        // Get basic info about the bot identity for this adapter
        async getLoginInfo(data) {
            return { user_id: data?.self_id || this.self_id || Bot?.uin, nickname: Bot?.nickname || "Yunzai Bot (WebChat)" };
        }

        // Parse message from client/Yunzai into segments if needed
         parseMsg(msg) {
            // Keep it simple: if string, wrap in text. If object/array, pass through.
            if (typeof msg === 'string') {
                return [{ type: 'text', text: msg }];
            }
            // Assume arrays or objects are already structured messages/segments
            if (typeof msg === 'object' && msg !== null) {
                // If it's not an array, wrap it in one if it looks like a single segment
                if (!Array.isArray(msg) && msg.type) {
                    return [msg];
                }
                // If it's an array or some other object structure, pass it as is
                 return msg;
            }
            return [{ type: 'text', text: String(msg) }]; // Fallback
         }

        // --- Stubs/Basic Implementations for other common adapter methods ---

        async recallMsg(data, message_id) {
            this.makeLog('info', `[${this.name}] recallMsg called for message ${message_id}`);
            // Notify all clients about the recall attempt
            const results = await this.broadcastMsg({
                 type: 'notice',
                 payload: {
                     notice_type: 'message_recall',
                     message_id: message_id,
                     operator_id: data?.self_id || this.self_id
                }
            });
            // We can't truly confirm recall on the client side here easily
            return results.some(r => r.status === 'ok'); // Return true if broadcast reached at least one client
        }

        async getMsg(data, message_id) {
             this.makeLog('warn', `[${this.name}] getMsg not implemented.`);
             // Could potentially request message history from clients if they store it
             return null;
        }

        async getFriendList(data) {
            this.makeLog('debug', `[${this.name}] getFriendList called.`);
            // Return connected clients identified as 'users'
             const friends = [];
             for (const [id, ctx] of this.clientContext.entries()) {
                 friends.push({
                     user_id: ctx.user_id || id,
                     nickname: ctx.nickname || `Web User ${id.substring(0,4)}`,
                     remark: `WebChat Client ${id}`
                 });
             }
             return new Map(friends.map(f => [f.user_id, f]));
        }

        async getGroupList(data) {
            this.makeLog('debug', `[${this.name}] getGroupList called.`);
            // Maybe represent the WebChat connection as a single "group"?
            // Or return nothing if groups aren't a concept here.
            return new Map([['webchat_group', { group_id: 'webchat_group', group_name: 'WebChat Clients' }]]);
        }

         async getMemberList(data, group_id) {
             this.makeLog('debug', `[${this.name}] getMemberList called for ${group_id}.`);
             if (group_id === 'webchat_group') {
                // Return connected clients as members
                const members = [];
                for (const [id, ctx] of this.clientContext.entries()) {
                     members.push({
                         user_id: ctx.user_id || id,
                         nickname: ctx.nickname || `Web User ${id.substring(0,4)}`,
                         card: ctx.nickname || `Web User ${id.substring(0,4)}`,
                         role: 'member', // Or 'admin'/'owner' based on context?
                     });
                 }
                 return new Map(members.map(m => [m.user_id, m]));
             }
             return new Map();
         }

         // Create a 'bot' object containing API methods, tailored to the event context
         getBotApi(eventData) {
             const botContext = {
                 ...this.botData, // Base bot data from Yunzai
                 self_id: this.self_id,
                 adapter: this,
                 uin: this.self_id,
                 nickname: Bot?.nickname || "Yunzai Bot (WebChat)",
                 // Add methods Yunzai expects, bound to the current context/client if possible
                 sendMsg: (msg) => this.sendMsg({ ...eventData }, msg), // Send reply using event context
                 recallMsg: (message_id) => this.recallMsg(eventData, message_id || eventData.message_id),
                 getLoginInfo: () => this.getLoginInfo(eventData),
                 // API calls initiated from here might go back to the originating client or broadcast
                 sendApi: (action, params) => this.handleApiCall(eventData.from_client_id || 'YunzaiInternal', action, params),
                 // Pick methods using event context
                 pickFriend: (user_id) => this.pickFriend(eventData, user_id),
                 pickMember: (group_id, user_id) => this.pickMember(eventData, group_id, user_id),
                 pickGroup: (group_id) => this.pickGroup(eventData, group_id),
             };
             return botContext;
         }


        // --- Pick Methods --- Provide basic info based on context

        pickFriend(data, user_id) {
             const friendCtx = Array.from(this.clientContext.values()).find(ctx => ctx.user_id === user_id);
             return {
                 ...data, // Pass context
                 user_id: user_id,
                 nickname: friendCtx?.nickname || `WebChat User ${user_id}`,
                 is_friend: true, // Assume all clients are 'friends'
                 sendMsg: (msg) => this.sendMsg({ ...data, message_type: 'private', user_id: user_id }, msg),
                 getAvatarUrl: () => '',
             };
         }

        pickMember(data, group_id, user_id) {
            const memberCtx = Array.from(this.clientContext.values()).find(ctx => ctx.user_id === user_id);
             return {
                 ...data,
                 group_id: group_id || 'webchat_group',
                 user_id: user_id,
                 nickname: memberCtx?.nickname || `Web Member ${user_id}`,
                 card: memberCtx?.nickname || `Web Member ${user_id}`,
                 role: user_id === this.self_id ? 'owner' : 'member',
                 is_friend: true,
                 sendMsg: (msg) => this.sendMsg({ ...data, message_type: 'private', user_id: user_id }, msg),
                 getAvatarUrl: () => '',
             };
        }

        pickGroup(data, group_id) {
            // Assume a single default group unless client provides group context
            const gid = group_id || 'webchat_group';
             return {
                 ...data,
                 group_id: gid,
                 group_name: `WebChat Group ${gid}`,
                 // Send message defaults to broadcast unless group_id maps to specific client(s)
                 sendMsg: (msg) => this.sendMsg({ ...data, message_type: 'group', group_id: gid }, msg),
                 getAvatarUrl: () => '',
                 getMemberList: async () => await this.getMemberList(data, gid),
                 getMemberMap: async () => await this.getMemberList(data, gid), // Alias
                 is_owner: true, // Bot controls this "group"
                 is_admin: true,
             };
        }

        // --- Connection and Lifecycle ---

        // Called by Yunzai when adapter is loaded/recognized for a bot instance
        async connect(botData) {
             this.makeLog('info', `Adapter connect called by Yunzai for bot ${botData.self_id}`);
             this.self_id = botData.self_id || Bot?.uin;
             this.botData = botData; // Store context from Yunzai

            // Ensure WS server is running (might be called before constructor finishes or if server failed)
            if (!this.wss) {
                 this.makeLog('warn', 'WebSocket server not running during connect, attempting to initialize.');
                 this.initWebSocketServer();
            }

            // Return the bot object Yunzai expects, including API methods
            const bot = this.getBotApi({ self_id: this.self_id });
            this.makeLog('info', `${this.name} ready for bot ${this.self_id}.`);
             return bot;
        }

         async load() {
             this.makeLog('info', `Adapter ${this.name} loaded.`);
             // Could perform initial setup here if needed
         }

         async unload() {
             this.makeLog('info', `Adapter ${this.name} unloading.`);
             if (this.wss) {
                 this.makeLog('info', 'Closing WebSocket server...');
                 // Gracefully close connections
                 this.clients.forEach(ws => ws.close(1001, 'Server shutting down'));
                 this.wss.close((err) => {
                     if (err) {
                         this.makeLog('error', `Error closing WebSocket server: ${err}`);
                     } else {
                         this.makeLog('info', 'WebSocket server closed.');
                     }
                     this.wss = null;
                 });
             }
             this.clients.clear();
             this.clientContext.clear();
         }

    }); // End of adapter class definition

    console.log('[WebChatAdapter] Adapter pushed to Bot.adapter.');

} else {
    console.error('[WebChatAdapter] Bot.adapter is not available. Adapter not loaded.');
} 