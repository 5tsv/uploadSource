export default {
  async fetch(r, env, ctx) {
      return handleRequest(r);
  },
};

async function handleRequest(request) {
  try {
    // 获取请求头
    const headers = request.headers
    // 解析 URL 参数
    const url = new URL(request.url)
    const repoOwner = url.searchParams.get('repoOwner')
    const repoName = url.searchParams.get('repoName')
    const path = url.searchParams.get('path') || ''
    const token = url.searchParams.get('token')

    // 检查必要参数
    if (!repoOwner || !repoName || !token) {
      return new Response(JSON.stringify({ msg: 'Missing required parameters: repoOwner, repoName, or token', code: 400 }), { status: 400 })
    }

    // 检查请求方法是否为 POST
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ msg: 'Invalid request method. Only POST is supported.', code: 405 }), { status: 405 })
    }

    // 获取请求体中的文件数据
    const formData = await request.formData()
    const file = formData.get('file')

    // 读取文件内容
    const content = await file.text();
    // 计算文件的 MD5 哈希值
    const sha = await calculateSHA(content)
    const githubFileName = `${sha}.json`

    // 构造路径参数（新增部分开始）-----
    const encodedPath = path
      .split('/')
      .filter(segment => segment) // 过滤空路径段
      .map(segment => encodeURIComponent(segment)) // 编码每个路径段
      .join('/');
    
    const fullPath = encodedPath 
      ? `${encodedPath}/${githubFileName}`
      : githubFileName;
    // 新增部分结束 -----

    // 构造 GitHub 请求
    const githubUrl = `https://api.github.com/repos/${
      encodeURIComponent(repoOwner) // 编码仓库拥有者
    }/${
      encodeURIComponent(repoName) // 编码仓库名称
    }/contents/${fullPath}`; // 使用完整路径

    const githubRequest = new Request(githubUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': headers.get('user-agent'),
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github+json'
      },
      body: JSON.stringify({
        message: `Upload ${githubFileName}`,
        content: btoa(unescape(encodeURIComponent(content))),
        sha: sha,
        branch: 'main'
      })
    })

    // 转发请求到 GitHub API
    const githubResponse = await fetch(githubRequest)

    // 直接返回 GitHub API 的原始响应
    return new Response(githubResponse.body, {
      status: githubResponse.status,
      statusText: githubResponse.statusText,
      headers: githubResponse.headers
    })
  } catch (e) {
    return new Response(JSON.stringify({ msg: e, code: 500 }), { status: 500 })
  }
}

// 计算 MD5 哈希值
async function calculateMD5(content) {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  const hashBuffer = await crypto.subtle.digest('MD5', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// 计算 SHA1 哈希值
async function calculateSHA(content) {
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content);
  
  // Git Blob 头部： "blob <size>\0"
  const header = `blob ${contentBytes.length}\0`;
  const headerBytes = encoder.encode(header);

  // 拼接头部和内容
  const totalBytes = new Uint8Array(headerBytes.length + contentBytes.length);
  totalBytes.set(headerBytes, 0);
  totalBytes.set(contentBytes, headerBytes.length);

  // 计算 SHA-1 哈希
  const hashBuffer = await crypto.subtle.digest('SHA-1', totalBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // 转换为十六进制字符串
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 生成时间文件名
function generateFilename() {
  const pad = n => n.toString().padStart(2, '0');
  const now = new Date();
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}
