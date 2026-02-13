# ahk-find-img
FindText - Capture screen image into text and then find it

https://www.autohotkey.com/boards/viewtopic.php?f=6&t=17834

Usage:  (required AHK v1.1.34+)
1. Capture the image to text string.
2. Test find the text string on full Screen.
3. When test is successful, you may copy the code
   and paste it into your own script.
   Note: Copy the "FindText()" function and the following
   functions and paste it into your own script Just once.
4. The more recommended way is to save the script as
   "FindText.ahk" and copy it to the "Lib" subdirectory
   of AHK program, instead of copying the "FindText()"
   function and the following functions, add a line to
   the beginning of your script: #Include <FindText>
5. If you want to call a method in the "FindTextClass" class,
   use the parameterless FindText() to get the default object

Excel file is just a fake identity!
Setting:
- Screen: 1280x720
- Graphic: min
- Full screen mode

## trumbox.net
Trước tiên, bạn cần lấy cookie JWT từ trình duyệt:

1. Truy cập https://trumbox.net/cloud-gaming/play/
2. Mở DevTools (F12) → Network tab
3. Lọc WS (WebSocket)
4. Tìm message có command `check-account`
5. Copy giá trị `cookie` (JWT token)

### 2. Cập nhật Cookie trong code

Mở file `trumbox-client.js` và thay thế cookie ở hàm `main()`:

```javascript
const YOUR_COOKIE = 'your-jwt-token-here';
```

### 3. Chạy script

```bash
node trumbox-client.js
```
