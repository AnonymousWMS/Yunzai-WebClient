import React, { useState, useRef, useEffect, useCallback } from 'react'
import { Layout, Input, Button, Space, Tag } from 'antd'
import { Bubble, Sender } from '@ant-design/x'
import type { BubbleProps } from '@ant-design/x'
import './App.css'

const { Header, Content, Footer } = Layout

// 定义消息接口 (适配 Bubble.List 的 items)
interface MessageItem extends BubbleProps {
  id: string
  type: 'system' | 'sent' | 'received'
  raw?: any // 原始数据，可选
}

function App() {
  const [wsUrl, setWsUrl] = useState('ws://localhost:2536/WebChat')
  const [isConnected, setIsConnected] = useState(false)
  const [statusText, setStatusText] = useState('未连接')
  const [statusColor, setStatusColor] = useState<string>('grey')
  const [messages, setMessages] = useState<MessageItem[]>([]) // 消息列表状态
  const [inputValue, setInputValue] = useState(''); // State for Sender input
  const ws = useRef<WebSocket | null>(null)
  const clientId = useRef<string | null>(null)
  const nickname = useRef(`WebAppUser_${Math.random().toString(36).substring(2, 7)}`)
  const userId = useRef(`web_${nickname.current}`)
  const chatContentRef = useRef<HTMLDivElement>(null)

  // --- Helper: 滚动到底部 ---
  const scrollToBottom = useCallback(() => {
    if (chatContentRef.current) {
      // Use setTimeout to allow DOM update before scrolling
      setTimeout(() => {
           if (chatContentRef.current) {
               chatContentRef.current.scrollTop = chatContentRef.current.scrollHeight
           }
      }, 0);
    }
  }, [])

  // --- Helper: 添加消息 ---
  const addMessage = useCallback((newMessageData: Omit<MessageItem, 'id'>) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { ...newMessageData, id: crypto.randomUUID() },
    ])
  }, [])

  // --- WebSocket Logic ---
  const connectWebSocket = useCallback((url: string) => {
    if (!url || (!url.startsWith('ws://') && !url.startsWith('wss://'))) {
      addMessage({ type: 'system', role: 'system', content: '无效的 WebSocket 地址' })
      setStatusText('地址无效')
      setStatusColor('error')
      return
    }

    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
      ws.current.close(1000, "Starting new connection")
      ws.current = null
    }

    addMessage({ type: 'system', role: 'system', content: `尝试连接到 ${url}...` })
    setStatusText('连接中...')
    setStatusColor('processing')
    setIsConnected(false)

    const websocket = new WebSocket(url)
    ws.current = websocket

    websocket.onopen = () => {
      setStatusText('已连接')
      setStatusColor('success')
      setIsConnected(true)
      addMessage({ type: 'system', role: 'system', content: 'WebSocket 连接已建立' })

      const authMsg = {
        type: 'auth',
        payload: {
          user_id: userId.current,
          nickname: nickname.current,
        },
      }
      try {
        websocket.send(JSON.stringify(authMsg))
      } catch (e) {
        addMessage({ type: 'system', role: 'system', content: `发送认证消息失败: ${e}` })
        console.error("Auth send error:", e)
      }
    }

    websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log('Received:', data)

        switch (data.type) {
          case 'connected':
            clientId.current = data.payload?.clientId
            setStatusText(`已连接 (ID: ${clientId.current?.substring(0, 6)}...)`)
            addMessage({ type: 'system', role: 'system', content: `成功连接到服务器 ${data.payload?.server || ''}, 客户端 ID: ${clientId.current}` })
            break
          case 'message':
            const receivedPayload = data.payload
            let contentNode: React.ReactNode = JSON.stringify(receivedPayload.message)

            const processImageSegment = (segment: any): React.ReactNode | null => {
              if (segment.type === 'image' && segment.file && segment.file.type === 'Buffer' && Array.isArray(segment.file.data)) {
                try {
                  const uint8Array = new Uint8Array(segment.file.data)
                  const blob = new Blob([uint8Array], { type: 'image/png' })
                  const imageUrl = URL.createObjectURL(blob)
                  return <img src={imageUrl} alt="Received" style={{ maxWidth: '75%', display: 'block', height: 'auto' }} onLoad={scrollToBottom} />
                } catch (imgError) {
                  console.error('Error processing image segment:', imgError)
                  return '[图片处理错误]'
                }
              }
              return null
            }

            if (typeof receivedPayload.message === 'string') {
              contentNode = receivedPayload.message.replace(/\n/g, '<br />')
            } else if (Array.isArray(receivedPayload.message)) {
              contentNode = receivedPayload.message.map((seg: any, index: number) => {
                const imgNode = processImageSegment(seg)
                if (imgNode) return <React.Fragment key={index}>{imgNode}</React.Fragment>
                if (seg.type === 'text') return <span key={index}>{seg.text}</span>
                if (seg.type === 'at') return <span key={index} style={{ color: 'blue' }}>{`@${seg.qq || seg.user_id || '某人'} `}</span>
                return <span key={index}>{`[${seg.type}]`}</span>
              })
            } else if (typeof receivedPayload.message === 'object' && receivedPayload.message !== null) {
              const imgNode = processImageSegment(receivedPayload.message)
              if (imgNode) {
                contentNode = imgNode
              } else {
                contentNode = JSON.stringify(receivedPayload.message)
              }
            }

            addMessage({
              type: 'received',
              role: 'assistant',
              content: contentNode,
              raw: data.payload,
            })
            break
          case 'auth_response':
            addMessage({ type: 'system', role: 'system', content: data.payload?.status === 'ok' ? `认证成功: ${nickname.current}` : `认证失败: ${data.payload?.message || '未知错误'}` })
            break
          case 'message_receipt': // Handle message receipt
            console.log(`服务器已接收消息 (echo: ${data.echo})`);
            break;
          case 'error':
            addMessage({ type: 'system', role: 'system', content: `服务器错误: ${data.message || JSON.stringify(data.payload)}` })
            setStatusColor('error')
            break
          default:
            addMessage({ type: 'system', role: 'system', content: `收到未知类型消息: ${data.type}` })
            console.warn('Unknown message type:', data)
        }
      } catch (error) {
        addMessage({ type: 'system', role: 'system', content: '处理接收到的消息时出错' })
        console.error('Failed to parse message or handle:', error)
      }
    }

    websocket.onclose = (event) => {
      setStatusText('已断开')
      setStatusColor('default')
      setIsConnected(false)
      addMessage({ type: 'system', role: 'system', content: `WebSocket 连接已断开 (Code: ${event.code}, Reason: ${event.reason || 'N/A'})` })
      clientId.current = null
      ws.current = null
    }

    websocket.onerror = (error) => {
      setStatusText('连接错误')
      setStatusColor('error')
      setIsConnected(false)
      addMessage({ type: 'system', role: 'system', content: 'WebSocket 连接发生错误' })
      console.error('WebSocket Error:', error)
      ws.current = null
    }

  }, [addMessage, scrollToBottom]) // Updated dependencies

  const handleConnect = useCallback(() => {
    connectWebSocket(wsUrl)
  }, [connectWebSocket, wsUrl])

  const handleDisconnect = useCallback(() => {
    if (ws.current) {
      addMessage({ type: 'system', role: 'system', content: '手动断开连接' })
      ws.current.close(1000, "User disconnected")
      ws.current = null
      setStatusText('已断开')
      setStatusColor('default')
      setIsConnected(false)
      clientId.current = null
    }
  }, [addMessage])

  // --- 发送消息逻辑 ---
  const handleSendMessage = useCallback((text: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      addMessage({ type: 'system', role: 'system', content: 'WebSocket 未连接，无法发送消息' })
      return
    }
    // text is already trimmed by Sender component usually, but double check
    const trimmedText = text.trim();
    if (!trimmedText) return

    const messageData = {
      type: 'message',
      echo: `c_${crypto.randomUUID()}`,
      payload: {
        message_type: 'private',
        user_id: userId.current,
        nickname: nickname.current,
        message: trimmedText,
      },
    }

    try {
      ws.current.send(JSON.stringify(messageData))
      addMessage({
        type: 'sent',
        role: 'user',
        content: trimmedText,
        raw: messageData.payload,
      })
      setInputValue(''); // Clear the input field
    } catch (error) {
      addMessage({ type: 'system', role: 'system', content: `发送消息失败: ${error}` })
      console.error('Failed to send message:', error)
    }
  }, [addMessage]) // Updated dependency

  // 自动滚动效果
  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // --- Cleanup WebSocket on component unmount ---
  useEffect(() => {
    return () => {
      ws.current?.close(1000, "Component unmounting")
    }
  }, [])

  // --- Filter messages for Bubble.List ---
  const chatMessages = messages.filter(msg => msg.type !== 'system')

  return (
    // Ensure Layout fills viewport and uses column flex layout
    <Layout style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header should not shrink */}
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 20px', backgroundColor: '#f0f2f5', flexShrink: 0 }}>
        <Space>
          {/* Header content */}
          <Input
            addonBefore="WebSocket URL"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            style={{ width: '400px' }}
            disabled={isConnected}
          />
          {isConnected ? (
            <Button type="primary" danger onClick={handleDisconnect}>断开连接</Button>
          ) : (
            <Button type="primary" onClick={handleConnect}>连接</Button>
          )}
          <Tag color={statusColor}>{statusText}</Tag>
        </Space>
      </Header>
      {/* Content should grow to fill space and allow internal scrolling */}
      <Content
        ref={chatContentRef}
        style={{
          flexGrow: 1, // Take up remaining vertical space
          overflowY: 'auto', // Allow scrolling when content overflows
          padding: '20px', // Internal padding for content
          backgroundColor: '#fff' // White background for chat area
          // The Layout component's default behavior should handle the children stacking correctly.
        }}
      >
        {/* Bubble.List renders chat messages */}
        <Bubble.List items={chatMessages} />
        {/* System messages rendered below chat messages */}
        {messages.filter(msg => msg.type === 'system').map(msg => (
          <div key={msg.id} style={{ textAlign: 'center', margin: '5px 0' }}>
            <Tag color="blue">{msg.content as React.ReactNode}</Tag>
          </div>
        ))}
      </Content>
      {/* Footer should not shrink */}
      <Footer style={{ padding: '10px 20px', backgroundColor: '#f0f2f5', flexShrink: 0 }}>
        {/* Sender component */}
        <Sender
           placeholder="输入消息..."
           onSubmit={handleSendMessage}
           disabled={!isConnected}
           value={inputValue}
           onChange={setInputValue}
         />
      </Footer>
    </Layout>
  )
}

export default App
