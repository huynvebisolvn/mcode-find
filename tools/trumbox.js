// ============================================
// TRUMBOX CLIENT - BROWSER VERSION
// Copy toàn bộ code này và paste vào Console của trình duyệt trên trang trumbox.net
// Sau đó chạy: runTrumbox()
// ============================================

class TrumboxClient {
  constructor(cookie) {
    this.wsUrl = 'wss://server.trumbox.net/ws/cloud_gaming';
    this.cookie = cookie;
    this.ws = null;
    this.user = null;
    this.groupClients = [];
    this.isRetrying = false;
    this.hasActiveClient = false;
    this.chooseClientResolver = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
      } catch (error) {
        console.error('❌ WebSocket error:', error);
        reject(error);
        return;
      }

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.setupMessageHandler();
        resolve();
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
      };
    });
  }

  setupMessageHandler() {
    this.ws.onmessage = (event) => {
      const message = event.data;
      
      // Xử lý ping/pong
      if (message === 'ping') {
        this.ws.send('pong');
        return;
      }

      try {
        const response = JSON.parse(message);
        // console.log('📨 Received:', JSON.stringify(response, null, 2));

        // Lưu thông tin user sau khi check-account
        if (response.command === 'check-account' && response.data) {
          this.user = response.data;
          console.log(`👤 User: ${this.user.username}, Balance: ${this.user.balance}`);
          
          // Kiểm tra xem user đã có máy đang chơi chưa
          if (response.data.latestConnect && response.data.latestConnect.nameClient) {
            console.log('⚠️  BẠN ĐÃ CÓ MÁY ĐANG CHƠI!');
            console.log(`🎮 Máy hiện tại: ${response.data.latestConnect.nameClient}`);
            this.hasActiveClient = true;
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
          if (this.chooseClientResolver) {
            this.chooseClientResolver({ success: false, message: 'busy' });
            this.chooseClientResolver = null;
          }
        }

      } catch (e) {
        // Không phải JSON, bỏ qua
      }
    };
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify(message);
      console.log('📤 Sending:', message.command);
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

  // Chọn máy chủ để chơi game (chỉ gửi request, không retry)
  chooseClient(clientId) {
    return new Promise((resolve, reject) => {
      if (!this.user) {
        console.error('❌ User info not available. Run checkAccount() first.');
        reject(new Error('User info not available'));
        return;
      }

      const client = this.groupClients.find(c => c.id === clientId);
      if (!client) {
        console.error(`❌ Client with ID ${clientId} not found`);
        console.log('Available clients:', this.groupClients.map(c => `${c.id}: ${c.name}`));
        reject(new Error('Client not found'));
        return;
      }

      // Lưu resolver để xử lý response
      this.chooseClientResolver = resolve;

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

      // Nếu sau 3 giây không có response "busy" → coi như thành công
      setTimeout(() => {
        if (this.chooseClientResolver) {
          console.log('✅ Không nhận được busy response → Kết nối thành công!');
          this.hasActiveClient = true;
          this.chooseClientResolver({ success: true });
          this.chooseClientResolver = null;
        }
      }, 3000);
    });
  }

  // Thử chọn client với retry vĩnh cửu
  async tryChooseClientWithRetry(clientId, delayMs = 3000) {
    console.log(`🔄 Bắt đầu thử kết nối (vòng lặp vĩnh cửu)...`);
    
    let attemptCount = 0;
    
    while (true) {
      attemptCount++;
      console.log(`\n🎯 Lần thử ${attemptCount}`);
      
      const result = await this.chooseClient(clientId);
      
      if (result.success) {
        console.log('\n🎉 Kết nối thành công! Đang stream game...');
        return true;
      }
      
      if (result.message === 'busy') {
        console.log(`⏳ Server busy, đợi ${delayMs/1000}s trước khi thử lại...`);
        await this.sleep(delayMs);
      }
    }
  }

  // Tự động: check account -> list clients -> chọn client đầu tiên
  async autoChooseClient(clientId = null) {
    console.log('🚀 Starting auto choose client...');
    
    // Bước 1: Check account
    this.checkAccount();
    await this.sleep(2000);

    console.log(`===============================`);
    
    // Kiểm tra xem đã có máy đang chơi chưa
    if (this.hasActiveClient) {
      return;
    }

    // Bước 2: List group clients (chỉ chạy khi chưa có máy)
    this.listGroupClients();
    await this.sleep(1500);
    
    // Bước 3: Chọn client với retry vĩnh cửu (mặc định là client đầu tiên hoặc theo ID)
    const targetClientId = clientId || (this.groupClients[0]?.id);
    if (targetClientId) {
      console.log(`🎮 Attempting to choose client ID: ${targetClientId}`);
      await this.tryChooseClientWithRetry(targetClientId, 3000);
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
// HELPER: Lấy cookie tự động từ browser
// ============================================
function getCookieFromBrowser() {
  // Cách 1: Lấy từ localStorage (nếu trumbox lưu ở đó)
  const localStorageToken = localStorage.getItem('token') || localStorage.getItem('jwt') || localStorage.getItem('auth');
  if (localStorageToken) {
    console.log('✅ Found token in localStorage');
    return localStorageToken;
  }

  // Cách 2: Lấy từ cookies
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'token' || name === 'jwt' || name === 'auth') {
      console.log('✅ Found token in cookies');
      return value;
    }
  }

  console.warn('⚠️  Không tìm thấy token tự động, vui lòng nhập thủ công');
  return null;
}

// ============================================
// CHẠY TỰ ĐỘNG
// ============================================
async function runTrumbox(clientId = 1, customCookie = null) {
  console.log('🎮 TRUMBOX AUTO CLIENT - BROWSER VERSION');
  console.log('==========================================\n');

  // Lấy cookie (tự động hoặc thủ công)
  let cookie = customCookie || getCookieFromBrowser();
  
  if (!cookie) {
    console.error('❌ Không có cookie! Chạy lại với cookie:');
    console.log('runTrumbox(1, "YOUR_COOKIE_HERE")');
    return;
  }

  const client = new TrumboxClient(cookie);

  try {
    // Kết nối
    await client.connect();

    // Chờ 1 giây để WebSocket ổn định
    await client.sleep(1000);

    // Tự động chọn client
    await client.autoChooseClient(clientId);

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

runTrumbox()
