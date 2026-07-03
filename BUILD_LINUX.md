# 实习生管理系统 — 跨平台构建说明

## 环境要求（GitHub Actions 云构建，无需本地 Linux）

本项目已配置好 `.github/workflows/build.yml`，推送到 GitHub 后自动在云端编译：
- ✅ **Windows** NSIS 安装包
- ✅ **Linux** .deb + .AppImage（适用于统信 UOS、Deepin、Ubuntu 等）

---

## 第一步：上传到 GitHub

如果你还没有 GitHub 仓库，在浏览器创建后按以下步骤推送：

```bash
# 1. 安装 git（如果已装则跳过）
# 2. 在项目目录初始化仓库
cd D:\AISpace\opencode\intern-rotation-system
git init
git add .
git commit -m "实习生管理系统 v1.0.0"

# 3. 关联你的 GitHub 仓库（把 <USER> 和 <REPO> 换成你自己的）
git remote add origin https://github.com/<USER>/<REPO>.git
git branch -M main
git push -u origin main
```

## 第二步：下载构建产物

1. 打开 GitHub 仓库页面 → 点击 **Actions** 标签
2. 在左侧列表找到 **Build** 工作流（会自动触发）
3. 等待 Windows 和 Linux 两个构建任务完成（约 10-15 分钟）
4. 点进运行记录 → **Summary** 页面 → 底部 **Artifacts** 区
5. 下载：
   - `实习生管理系统_Windows_x64` → 解压 → `.exe` = Windows 安装包
   - `实习生管理系统_Linux_x64` → 解压 → `.deb` 和 `.AppImage` = Linux 安装包

## 第三步：在统信 UOS 上安装

### 方案 A：双击 .deb 安装
```bash
sudo dpkg -i 实习生管理系统*.deb
sudo apt-get install -f  # 自动补全依赖
```

### 方案 B：双击 .AppImage（免安装）
```bash
chmod +x 实习生管理系统*.AppImage
./实习生管理系统*.AppImage
```

---

## 构建产物

| 平台 | 格式 | 预估大小 |
|------|------|---------|
| Windows | .exe (NSIS) | ~2.7 MB |
| Linux (统信/UOS) | .deb | ~4 MB |
| Linux (通用) | .AppImage | ~8 MB |