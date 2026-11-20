/* GitHub Pages 前端配置：部署后端到 Render 后，把下面地址替换成 Render 提供的 https://xxxx.onrender.com */
window.API_BASE_URL = 'https://yuexiang.onrender.com/';
window.apiUrl = function(path) {
  return window.API_BASE_URL.replace(/\/$/, '') + path;
};
