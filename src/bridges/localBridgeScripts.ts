export const WINDOWS_PS1_BRIDGE = `# RO Survivors Hybrid Bridge - Windows Win32 SendInput
# Listen on http://127.0.0.1:17325 and send real OS hardware-level keys/clicks
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public static class RoWinInput {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);

    [DllImport("user32.dll")]
    public static extern uint MapVirtualKey(uint uCode, uint uMapType);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern bool GetCursorPos(out POINT lpPoint);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextLength(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetAncestor(IntPtr hwnd, uint gaFlags);

    [DllImport("user32.dll")]
    public static extern int GetSystemMetrics(int nIndex);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern IntPtr SetProcessDpiAwarenessContext(IntPtr value);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT {
        public uint type;
        public InputUnion u;
    }

    [StructLayout(LayoutKind.Explicit)]
    public struct InputUnion {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT {
        public uint uMsg;
        public ushort wParamL;
        public ushort wParamH;
    }

    public static void InitDpi() {
        try {
            SetProcessDpiAwarenessContext(new IntPtr(-4));
        } catch {
            try { SetProcessDPIAware(); } catch {}
        }
    }

    private static string ReadWindowTitle(IntPtr h) {
        if (h == IntPtr.Zero) return "";
        try {
            int len = GetWindowTextLength(h);
            if (len <= 0) return "";
            StringBuilder sb = new StringBuilder(len + 1);
            GetWindowText(h, sb, sb.Capacity);
            return sb.ToString();
        } catch {
            return "";
        }
    }

    private static string ReadProcessName(IntPtr h) {
        if (h == IntPtr.Zero) return "";
        try {
            uint pid = 0;
            GetWindowThreadProcessId(h, out pid);
            if (pid == 0) return "";
            return Process.GetProcessById((int)pid).ProcessName.ToLowerInvariant();
        } catch {
            return "";
        }
    }

    public static bool IsBrowserProcess(string name) {
        if (string.IsNullOrEmpty(name)) return false;
        switch (name.ToLowerInvariant()) {
            case "chrome":
            case "msedge":
            case "firefox":
            case "brave":
            case "opera":
            case "opera_gx":
            case "vivaldi":
            case "chromium":
            case "arc":
            case "thorium":
            case "centbrowser":
            case "waterfox":
            case "floorp":
            case "zen":
            case "librewolf":
            case "whale":
            case "yandex":
                return true;
            default:
                return false;
        }
    }

    public static string[] GetForegroundInfo() {
        try {
            IntPtr h = GetForegroundWindow();
            if (h == IntPtr.Zero) return new string[] { "", "" };
            string proc = ReadProcessName(h);
            string title = ReadWindowTitle(h);
            if (!IsBrowserProcess(proc)) {
                IntPtr root = GetAncestor(h, 3); // GA_ROOTOWNER
                if (root != IntPtr.Zero && root != h) {
                    string rootProc = ReadProcessName(root);
                    if (IsBrowserProcess(rootProc)) {
                        proc = rootProc;
                        if (string.IsNullOrEmpty(title)) title = ReadWindowTitle(root);
                    }
                }
            }
            return new string[] { proc ?? "", title ?? "" };
        } catch {
            return new string[] { "", "" };
        }
    }

    public static bool IsBrowserForeground() {
        string[] info = GetForegroundInfo();
        return info != null && info.Length > 0 && IsBrowserProcess(info[0]);
    }

    public static int[] GetForegroundWinRect() {
        try {
            IntPtr h = GetForegroundWindow();
            RECT r;
            if (h != IntPtr.Zero && GetWindowRect(h, out r)) {
                return new int[] { r.Left, r.Top, r.Right, r.Bottom };
            }
        } catch {}
        return null;
    }

    public static int[] GetCursorPoint() {
        try {
            POINT p;
            if (GetCursorPos(out p)) {
                return new int[] { p.X, p.Y };
            }
        } catch {}
        return null;
    }

    public static void KeyEvent(ushort vk, bool isUp, bool isExtended) {
        INPUT[] inp = new INPUT[1];
        inp[0].type = 1; // INPUT_KEYBOARD
        inp[0].u.ki.wVk = vk;
        inp[0].u.ki.wScan = (ushort)MapVirtualKey(vk, 0);
        uint flags = 0;
        if (isExtended) flags |= 0x0001; // KEYEVENTF_EXTENDEDKEY
        if (isUp) flags |= 0x0002;       // KEYEVENTF_KEYUP
        inp[0].u.ki.dwFlags = flags;
        inp[0].u.ki.time = 0;
        inp[0].u.ki.dwExtraInfo = IntPtr.Zero;
        SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void MouseMoveAbs(int screenX, int screenY) {
        SetCursorPos(screenX, screenY);
        int vx = GetSystemMetrics(76); // SM_XVIRTUALSCREEN
        int vy = GetSystemMetrics(77); // SM_YVIRTUALSCREEN
        int vw = Math.Max(2, GetSystemMetrics(78)); // SM_CXVIRTUALSCREEN
        int vh = Math.Max(2, GetSystemMetrics(79)); // SM_CYVIRTUALSCREEN
        int nx = (int)Math.Round(((screenX - vx) * 65535.0) / (vw - 1));
        int ny = (int)Math.Round(((screenY - vy) * 65535.0) / (vh - 1));
        INPUT[] inp = new INPUT[1];
        inp[0].type = 0; // INPUT_MOUSE
        inp[0].u.mi.dx = nx;
        inp[0].u.mi.dy = ny;
        inp[0].u.mi.dwFlags = 0x0001 | 0x4000 | 0x8000; // MOVE | VIRTUALDESK | ABSOLUTE
        SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
        SetCursorPos(screenX, screenY);
    }

    public static void MouseButton(bool isUp) {
        INPUT[] inp = new INPUT[1];
        inp[0].type = 0;
        inp[0].u.mi.dwFlags = isUp ? 0x0004u : 0x0002u; // LEFTUP : LEFTDOWN
        SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
    }

    public static void MouseWheel(int delta) {
        INPUT[] inp = new INPUT[1];
        inp[0].type = 0; // INPUT_MOUSE
        inp[0].u.mi.mouseData = unchecked((uint)delta);
        inp[0].u.mi.dwFlags = 0x0800u; // MOUSEEVENTF_WHEEL
        inp[0].u.mi.time = 0;
        inp[0].u.mi.dwExtraInfo = IntPtr.Zero;
        SendInput(1, inp, Marshal.SizeOf(typeof(INPUT)));
    }
}
"@

[RoWinInput]::InitDpi()

function Get-StateSnapshot() {
    $wr = [RoWinInput]::GetForegroundWinRect()
    $cp = [RoWinInput]::GetCursorPoint()
    $winRect = $null
    if ($null -ne $wr -and $wr.Length -eq 4) {
        $winRect = @{ left = $wr[0]; top = $wr[1]; right = $wr[2]; bottom = $wr[3] }
    }
    $cursor = $null
    if ($null -ne $cp -and $cp.Length -eq 2) {
        $cursor = @{ x = $cp[0]; y = $cp[1] }
    }
    return @{ winRect = $winRect; cursor = $cursor }
}

function Resolve-Vk([string]$key) {
    switch -CaseSensitive ($key) {
        '1' { return @{ vk = 0x31; ext = $false } }
        '2' { return @{ vk = 0x32; ext = $false } }
        '3' { return @{ vk = 0x33; ext = $false } }
        '4' { return @{ vk = 0x34; ext = $false } }
        'b' { return @{ vk = 0x42; ext = $false } }
        'B' { return @{ vk = 0x42; ext = $false } }
        'c' { return @{ vk = 0x43; ext = $false } }
        'C' { return @{ vk = 0x43; ext = $false } }
        'k' { return @{ vk = 0x4B; ext = $false } }
        'K' { return @{ vk = 0x4B; ext = $false } }
        'w' { return @{ vk = 0x57; ext = $false } }
        'W' { return @{ vk = 0x57; ext = $false } }
        'a' { return @{ vk = 0x41; ext = $false } }
        'A' { return @{ vk = 0x41; ext = $false } }
        's' { return @{ vk = 0x53; ext = $false } }
        'S' { return @{ vk = 0x53; ext = $false } }
        'd' { return @{ vk = 0x44; ext = $false } }
        'D' { return @{ vk = 0x44; ext = $false } }
        ' ' { return @{ vk = 0x20; ext = $false } }
        'Space' { return @{ vk = 0x20; ext = $false } }
        'Escape' { return @{ vk = 0x1B; ext = $false } }
        'ArrowLeft' { return @{ vk = 0x25; ext = $true } }
        'ArrowUp' { return @{ vk = 0x26; ext = $true } }
        'ArrowRight' { return @{ vk = 0x27; ext = $true } }
        'ArrowDown' { return @{ vk = 0x28; ext = $true } }
        default { return $null }
    }
}

function Send-Json($res, [int]$code, $obj) {
    $json = ($obj | ConvertTo-Json -Compress -Depth 4)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $res.StatusCode = $code
    $res.ContentType = 'application/json; charset=utf-8'
    $res.Headers['Access-Control-Allow-Origin'] = '*'
    $res.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    $res.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
}

$port = 17325
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")
$listener.Start()

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host " RO 倖存者 混合橋接已啟動 (Win32 SendInput)" -ForegroundColor Green
Write-Host " 監聽網址: http://127.0.0.1:$port" -ForegroundColor Yellow
Write-Host " 提示: 使用時請讓遊戲瀏覽器保持在最上層前景視窗" -ForegroundColor Gray
Write-Host " 按 Ctrl+C 可結束程式" -ForegroundColor Gray
Write-Host "==================================================" -ForegroundColor Cyan

try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        try {
            if ($req.HttpMethod -eq 'OPTIONS') {
                Send-Json $res 200 @{ ok = $true }
                continue
            }

            if ($req.HttpMethod -eq 'GET' -and $req.Url.AbsolutePath -eq '/ping') {
                $snap = Get-StateSnapshot
                Send-Json $res 200 @{ ok = $true; mode = 'win32_sendinput'; port = $port; winRect = $snap.winRect; cursor = $snap.cursor }
                continue
            }

            if ($req.HttpMethod -eq 'POST' -and $req.Url.AbsolutePath -eq '/action') {
                $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
                $rawBody = $reader.ReadToEnd()
                $payload = $rawBody | ConvertFrom-Json

                $actType = [string]$payload.type
                $requireFocus = $true
                if ($null -ne $payload.requireFocus) { $requireFocus = [bool]$payload.requireFocus }
                $pageFocused = $true
                if ($null -ne $payload.pageFocused) { $pageFocused = [bool]$payload.pageFocused }

                $fgInfo = [RoWinInput]::GetForegroundInfo()
                $fgProc = if ($null -ne $fgInfo -and $fgInfo.Length -ge 1) { [string]$fgInfo[0] } else { '' }
                $fgTitle = if ($null -ne $fgInfo -and $fgInfo.Length -ge 2) { [string]$fgInfo[1] } else { '' }
                $isBrowserFg = [RoWinInput]::IsBrowserProcess($fgProc)
                $pageVisible = $true
                if ($null -ne $payload.pageVisible) { $pageVisible = [bool]$payload.pageVisible }
                $pageTitle = ''
                if ($null -ne $payload.pageTitle) { $pageTitle = ([string]$payload.pageTitle).Trim() }
                $titleMatchesGame = $false
                if ($fgTitle) {
                    if ($pageTitle -and $pageTitle.Length -ge 2 -and $fgTitle.IndexOf($pageTitle, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) {
                        $titleMatchesGame = $true
                    } elseif ($fgTitle -match 'RO|倖存者|Survivors|ro-survivors') {
                        $titleMatchesGame = $true
                    }
                }
                $focusOk = $isBrowserFg -and ($pageFocused -or ($pageVisible -and $titleMatchesGame))

                if ($actType -ne 'key_up' -and $requireFocus -and (-not $focusOk)) {
                    Write-Host ("[{0}] 略過輸入 (瀏覽器非前景: fg={1}, focused={2}, visible={3}, titleMatch={4}): {5}" -f (Get-Date -Format 'HH:mm:ss'), $fgProc, $pageFocused, $pageVisible, $titleMatchesGame, $actType) -ForegroundColor DarkGray
                    Send-Json $res 200 @{ ok = $false; reason = 'browser_not_focused'; mode = 'win32_sendinput'; fgProc = $fgProc; pageFocused = $pageFocused; pageVisible = $pageVisible; titleMatch = $titleMatchesGame }
                    continue
                }

                if ($actType -eq 'key' -or $actType -eq 'key_down' -or $actType -eq 'key_up') {
                    $vkInfo = Resolve-Vk ([string]$payload.key)
                    if ($null -eq $vkInfo) {
                        Send-Json $res 400 @{ ok = $false; reason = 'unsupported_key' }
                        continue
                    }
                    $vk = [uint16]$vkInfo.vk
                    $ext = [bool]$vkInfo.ext
                    if ($actType -eq 'key_down') {
                        [RoWinInput]::KeyEvent($vk, $false, $ext)
                    } elseif ($actType -eq 'key_up') {
                        [RoWinInput]::KeyEvent($vk, $true, $ext)
                    } else {
                        $hold = [Math]::Max(20, [Math]::Min(220, [int]$payload.holdMs))
                        [RoWinInput]::KeyEvent($vk, $false, $ext)
                        Start-Sleep -Milliseconds $hold
                        [RoWinInput]::KeyEvent($vk, $true, $ext)
                        $keyDisplay = if ($payload.key -eq ' ') { 'Space' } else { $payload.key }
                        Write-Host ("[{0}] 真實按鍵: {1} (停留 {2}ms)" -f (Get-Date -Format 'HH:mm:ss'), $keyDisplay, $hold)
                    }
                    Send-Json $res 200 @{ ok = $true; mode = 'win32_sendinput' }
                    continue
                }

                if ($actType -eq 'move') {
                    $sx = [int]$payload.screenX
                    $sy = [int]$payload.screenY
                    [RoWinInput]::MouseMoveAbs($sx, $sy)
                    $snap = Get-StateSnapshot
                    Write-Host ("[{0}] 移動游標: ({1}, {2}) {3}" -f (Get-Date -Format 'HH:mm:ss'), $sx, $sy, $payload.label) -ForegroundColor DarkCyan
                    Send-Json $res 200 @{ ok = $true; mode = 'win32_sendinput'; winRect = $snap.winRect; cursor = $snap.cursor }
                    continue
                }

                if ($actType -eq 'click_here') {
                    $hold = [Math]::Max(18, [Math]::Min(160, [int]$payload.holdMs))
                    [RoWinInput]::MouseButton($false)
                    Start-Sleep -Milliseconds $hold
                    [RoWinInput]::MouseButton($true)
                    $snap = Get-StateSnapshot
                    Write-Host ("[{0}] 真實點擊(已校準): {1}" -f (Get-Date -Format 'HH:mm:ss'), $payload.label) -ForegroundColor Green
                    Send-Json $res 200 @{ ok = $true; mode = 'win32_sendinput'; cursor = $snap.cursor }
                    continue
                }

                if ($actType -eq 'click') {
                    $sx = [int]$payload.screenX
                    $sy = [int]$payload.screenY
                    $hold = [Math]::Max(18, [Math]::Min(160, [int]$payload.holdMs))
                    [RoWinInput]::MouseMoveAbs($sx, $sy)
                    Start-Sleep -Milliseconds (Get-Random -Minimum 14 -Maximum 28)
                    [RoWinInput]::MouseButton($false)
                    Start-Sleep -Milliseconds $hold
                    [RoWinInput]::MouseButton($true)
                    Write-Host ("[{0}] 真實點擊: ({1}, {2}) {3}" -f (Get-Date -Format 'HH:mm:ss'), $sx, $sy, $payload.label) -ForegroundColor Green
                    Send-Json $res 200 @{ ok = $true; mode = 'win32_sendinput' }
                    continue
                }

                if ($actType -eq 'wheel') {
                    $moveFirst = $true
                    if ($null -ne $payload.moveFirst) { $moveFirst = [bool]$payload.moveFirst }
                    if ($moveFirst -and $null -ne $payload.screenX -and $null -ne $payload.screenY) {
                        $sx = [int]$payload.screenX
                        $sy = [int]$payload.screenY
                        [RoWinInput]::MouseMoveAbs($sx, $sy)
                        Start-Sleep -Milliseconds (Get-Random -Minimum 18 -Maximum 34)
                    }
                    $delta = -120
                    if ($null -ne $payload.delta -and [int]$payload.delta -ne 0) { $delta = [int]$payload.delta }
                    $steps = 1
                    if ($null -ne $payload.steps) { $steps = [Math]::Max(1, [Math]::Min(20, [int]$payload.steps)) }
                    $intervalMs = 45
                    if ($null -ne $payload.intervalMs) { $intervalMs = [Math]::Max(15, [Math]::Min(200, [int]$payload.intervalMs)) }
                    for ($i = 0; $i -lt $steps; $i++) {
                        [RoWinInput]::MouseWheel($delta)
                        if ($i -lt ($steps - 1)) {
                            $jitter = Get-Random -Minimum ([Math]::Max(15, $intervalMs - 12)) -Maximum ($intervalMs + 16)
                            Start-Sleep -Milliseconds $jitter
                        }
                    }
                    Write-Host ("[{0}] 真實滾輪: delta={1} x{2} {3}" -f (Get-Date -Format 'HH:mm:ss'), $delta, $steps, $payload.label) -ForegroundColor Cyan
                    Send-Json $res 200 @{ ok = $true; mode = 'win32_sendinput'; steps = $steps; delta = $delta }
                    continue
                }

                Send-Json $res 400 @{ ok = $false; reason = 'unknown_action' }
                continue
            }

            Send-Json $res 404 @{ ok = $false; reason = 'not_found' }
        } catch {
            try { Send-Json $res 500 @{ ok = $false; reason = $_.Exception.Message } } catch {}
        }
    }
} finally {
    if ($listener) { $listener.Stop(); $listener.Close() }
}
`;

export const WINDOWS_BAT_LAUNCHER = [
  '@echo off',
  'chcp 65001 >nul',
  'title RO Survivors Hybrid Bridge',
  'if not exist "%~dp0ro_bridge_win.ps1" goto :missing',
  'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0ro_bridge_win.ps1"',
  'goto :end',
  ':missing',
  'echo [ERROR] ro_bridge_win.ps1 not found in the same folder.',
  'echo Please place ro_bridge_win.ps1 and start_ro_bridge.bat in the same folder.',
  ':end',
  'pause',
  '',
].join('\r\n');
