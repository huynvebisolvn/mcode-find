const WebSocket = require('ws');

class TrumboxClient {
  constructor(cookie) {
    this.wsUrl = 'wss://server.trumbox.net/ws/cloud_gaming';
    this.cookie = cookie;
    this.ws = null;
    this.user = null;
    this.groupClients = [];
    this.retryClientId = null;
    this.isRetrying = false;
    this.hasActiveClient = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl, {
        headers: {
          'Origin': 'https://trumbox.net',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        }
      });

      this.ws.on('open', () => {
        console.log('✅ WebSocket connected');
        this.setupMessageHandler();
        resolve();
      });

      this.ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
      });
    });
  }

  setupMessageHandler() {
    this.ws.on('message', (data) => {
      const message = data.toString();
      
      // Xử lý ping/pong
      if (message === 'ping') {
        this.ws.send('pong');
        return;
      }

      try {
        const response = JSON.parse(message);
        console.log('📨 Received:', JSON.stringify(response, null, 2));

        // Lưu thông tin user sau khi check-account
        if (response.command === 'check-account' && response.data) {
          this.user = response.data;
          console.log(`👤 User: ${this.user.username}, Balance: ${this.user.balance}`);
          
          // Kiểm tra xem user đã có máy đang chơi chưa
          if (response.data.latestConnect && response.data.latestConnect.nameClient) {
            console.log('⚠️  BẠN ĐÃ CÓ MÁY ĐANG CHƠI!');
            console.log(`🎮 Máy hiện tại: ${response.data.latestConnect.nameClient}`);
            this.hasActiveClient = true;
            this.retryClientId = null; // Dừng mọi retry
          }
        }

        // Lưu danh sách group clients
        if (response.command === 'list-group-client' && response.data) {
          this.groupClients = response.data.groupClient;
          console.log(`🖥️  Available groups: ${this.groupClients.length}`);
          this.groupClients.forEach(g => {
            console.log(`   - ${g.name} (ID: ${g.id}) - ${g.price}đ`);
          });
        }

        // Xử lý kết quả choose-client
        if (response.command === 'status-all-busy') {
          console.log('⚠️  All servers busy:', response.data.message);
          
          // Tự động retry sau 1 giây nếu đang có clientId cần chọn
          if (this.retryClientId !== null) {
            console.log('🔄 Retrying in 1 second...');
            setTimeout(() => {
              if (this.retryClientId !== null) {
                this.chooseClient(this.retryClientId);
              }
            }, 1000);
          }
        } else if (response.command && 
                   response.command !== 'check-account' && 
                   response.command !== 'list-group-client' && 
                   response.command !== 'status-all-busy') {
          // Nhận được response khác status-all-busy => Thành công
          if (this.retryClientId !== null) {
            console.log('✅ SUCCESS! Received:', response.command);
            console.log('🛑 Stopping retry loop');
            this.retryClientId = null; // Dừng retry NGAY LẬP TỨC
          }
        }

      } catch (e) {
        // Không phải JSON, bỏ qua
      }
    });
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify(message);
      console.log('📤 Sending:', msg);
      this.ws.send(msg);
    } else {
      console.error('❌ WebSocket not connected');
    }
  }

  // Kiểm tra tài khoản
  checkAccount() {
    this.send({
      typeClient: 'user',
      command: 'check-account',
      method: 'post',
      data: {
        cookie: this.cookie
      }
    });
  }

  // Lấy danh sách group clients
  listGroupClients() {
    this.send({
      typeClient: 'user',
      command: 'list-group-client',
      method: 'get'
    });
  }

  // Chọn máy chủ để chơi game
  chooseClient(clientId) {
    if (!this.user) {
      console.error('❌ User info not available. Run checkAccount() first.');
      return;
    }

    const client = this.groupClients.find(c => c.id === clientId);
    if (!client) {
      console.error(`❌ Client with ID ${clientId} not found`);
      console.log('Available clients:', this.groupClients.map(c => `${c.id}: ${c.name}`));
      return;
    }

    // Lưu clientId để có thể retry
    this.retryClientId = clientId;

    this.send({
      typeClient: 'user',
      command: 'choose-client',
      method: 'post',
      data: {
        client: {
          ...client,
          isDialogOpen: true
        },
        user: this.user
      }
    });
  }

  // Tự động: check account -> list clients -> chọn client đầu tiên
  async autoChooseClient(clientId = null) {
    console.log('🚀 Starting auto choose client...');
    
    // Bước 1: Check account
    this.checkAccount();
    await this.sleep(2000); // Tăng thời gian đợi để nhận response

    console.log(`===============================`);
    
    // Kiểm tra xem đã có máy đang chơi chưa
    if (this.hasActiveClient) {
      return;
    }

    // Bước 2: List group clients (chỉ chạy khi chưa có máy)
    this.listGroupClients();
    await this.sleep(1500);
    
    // Bước 3: Chọn client (mặc định là client đầu tiên hoặc theo ID)
    const targetClientId = clientId || (this.groupClients[0]?.id);
    if (targetClientId) {
      console.log(`🎮 Attempting to choose client ID: ${targetClientId}`);
      this.chooseClient(targetClientId);
    } else {
      console.error('❌ No client available to choose');
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// ============================================
// Sử dụng
// ============================================

async function main() {
  // Cookie JWT của bạn
  const YOUR_COOKIE = 'eyJh';

  const client = new TrumboxClient(YOUR_COOKIE);

  try {
    // Kết nối
    await client.connect();

    // Chờ 1 giây để WebSocket ổn định
    await client.sleep(1000);

    // Tự động chọn client (ID = 1 là "Tiêu Chuẩn")
    await client.autoChooseClient(1);

    // Giữ kết nối - chỉ disconnect khi thành công hoặc Ctrl+C
    // Nếu muốn auto-disconnect sau 1 giờ không thành công:
    setTimeout(() => {
      if (client.retryClientId !== null) {
        console.log('⏱️  Timeout after 1 hour, disconnecting...');
        client.disconnect();
        process.exit(0);
      }
    }, 3600000); // 1 giờ

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Chạy nếu file được execute trực tiếp
if (require.main === module) {
  main();
}

module.exports = TrumboxClient;
