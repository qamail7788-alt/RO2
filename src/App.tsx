import { useEffect, useRef, useState } from 'react';
import { Download, Copy, Check, ShieldCheck, Sparkles, Terminal, Cpu } from 'lucide-react';
import {
  WINDOWS_PS1_BRIDGE,
  WINDOWS_BAT_LAUNCHER,
} from './bridges/localBridgeScripts';

export default function App() {
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [bridgeFeedback, setBridgeFeedback] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [scriptVersion, setScriptVersion] = useState('2.46.0');
  const scriptPromiseRef = useRef<Promise<string> | null>(null);

  const loadUserscript = async (): Promise<string> => {
    if (scriptText) return scriptText;
    if (!scriptPromiseRef.current) {
      scriptPromiseRef.current = fetch('/ro_auto_pick.user.js', { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        })
        .then((text) => {
          setScriptText(text);
          const ver = text.match(/@version\s+([^\s]+)/)?.[1];
          if (ver) setScriptVersion(ver);
          return text;
        })
        .catch((err) => {
          scriptPromiseRef.current = null;
          throw err;
        });
    }
    return scriptPromiseRef.current;
  };

  useEffect(() => {
    void loadUserscript().catch(() => {});
  }, []);

  const triggerTextDownload = (filename: string, content: string, withUtf8Bom = false, useCrlf = false) => {
    const normalized = useCrlf ? content.replace(/\r?\n/g, '\r\n') : content;
    const body = withUtf8Bom ? '\uFEFF' + normalized : normalized;
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadWinBridge = () => {
    triggerTextDownload('ro_bridge_win.ps1', WINDOWS_PS1_BRIDGE, true, true);
    setTimeout(() => {
      triggerTextDownload('start_ro_bridge.bat', WINDOWS_BAT_LAUNCHER, false, true);
    }, 200);
    setBridgeFeedback('已下載 ro_bridge_win.ps1 + start_ro_bridge.bat');
    setTimeout(() => setBridgeFeedback(''), 3500);
  };

  const handleDownload = async () => {
    try {
      const content = await loadUserscript();
      const blob = new Blob([content], { type: 'application/javascript;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ro_auto_pick.user.js';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch {
      window.location.href = '/ro_auto_pick.user.js?download=1';
    }
  };

  const handleCopy = async () => {
    try {
      const content = await loadUserscript();
      try {
        await navigator.clipboard.writeText(content);
      } catch {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.location.href = '/ro_auto_pick.user.js?download=1';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 selection:bg-amber-500/30 selection:text-amber-200">
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center backdrop-blur-sm">
        {/* Logo / Badge */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 mb-5 text-slate-950">
          <Sparkles className="w-8 h-8" />
        </div>

        <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white mb-2">
          RO 倖存者 自動選技輔助
        </h1>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-amber-400 mb-6">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Tampermonkey UserScript · v{scriptVersion}</span>
        </div>

        {/* 核心主按鈕：一鍵複製程式碼 */}
        <button
          onClick={handleCopy}
          className={`w-full py-4 px-6 rounded-xl font-bold text-base flex items-center justify-center gap-2.5 transition-all duration-200 shadow-xl cursor-pointer ${
            copied
              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/25 scale-[0.99]'
              : 'bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 shadow-amber-500/25 hover:shadow-amber-500/35 hover:scale-[1.01]'
          }`}
        >
          {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
          <span>{copied ? '已複製全部程式碼到剪貼簿！' : '一鍵複製腳本程式碼'}</span>
        </button>

        {/* 次要輔助按鈕：下載腳本 */}
        <button
          onClick={handleDownload}
          className="mt-3 w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {downloaded ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Download className="w-3.5 h-3.5 text-slate-400" />}
          <span>{downloaded ? '已開始下載腳本！' : '或點此下載腳本檔案 (.user.js)'}</span>
        </button>

        {/* 安裝說明 */}
        <div className="w-full mt-6 pt-5 border-t border-slate-800/80 text-left text-xs text-slate-400 space-y-2">
          <p className="font-semibold text-slate-300">簡易安裝步驟：</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-400/90 leading-relaxed">
            <li>點擊上方按鈕複製完整腳本程式碼（或下載 <code className="text-amber-300 font-mono">ro_auto_pick.user.js</code>）</li>
            <li>開啟瀏覽器 Tampermonkey 擴充套件，新增腳本並貼上儲存</li>
            <li>前往遊戲 <a href="https://ro-survivors.com" target="_blank" rel="noreferrer" className="text-amber-400 hover:underline">ro-survivors.com</a> 即自動載入</li>
          </ol>
        </div>

        {/* 跨電腦設定檔匯出與匯入說明 */}
        <div className="w-full mt-5 pt-5 border-t border-slate-800/80 text-left text-xs space-y-2.5">
          <div className="flex items-center gap-1.5 text-sky-400 font-bold">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>跨電腦設定檔備份與轉移 (匯出 / 匯入)</span>
          </div>
          <p className="text-slate-400 leading-relaxed text-[11.5px]">
            在遊戲內懸浮面板「主控」分頁的「設定檔」區塊：
          </p>
          <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3 space-y-2 text-[11px] text-slate-300">
            <div className="flex items-start gap-2">
              <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800/60 font-semibold text-[10px] shrink-0">📤 匯出</span>
              <span>點擊「<strong className="text-sky-300">📤 匯出設定檔</strong>」，將自動下載 <code className="text-amber-300 font-mono">ro_survivors_config_*.json</code> 備份檔，並同步複製 JSON 代碼到剪貼簿。</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800/60 font-semibold text-[10px] shrink-0">📥 匯入</span>
              <span>到另一台電腦開啟遊戲，點擊「<strong className="text-amber-300">📥 匯入設定檔</strong>」，載入備份檔或貼上代碼，即可一秒完整還原 23 職業神祇、詞條、自訂順位與刷圖走位設定！</span>
            </div>
          </div>
        </div>

        {/* 混合模式：本機真實按鍵橋接 */}
        <div className="w-full mt-5 pt-5 border-t border-slate-800/80 text-left text-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-emerald-400 flex items-center gap-1.5">
              <Cpu className="w-4 h-4" />
              混合模式：本機真實按鍵橋接 (127.0.0.1:17325)
            </span>
          </div>
          <p className="text-slate-400 leading-relaxed">
            Tampermonkey 僅讀取卡片與算分，交由本機程式送出原生 <code className="text-emerald-300 font-mono">1 / 2 / 3 / 4 / B</code> 按鍵、點擊與滑鼠滾輪，網頁不觸發假事件。
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              onClick={handleDownloadWinBridge}
              className="py-2.5 px-3 rounded-xl font-semibold text-xs text-emerald-950 bg-emerald-400 hover:bg-emerald-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>下載 Windows 免安裝實體鍵鼠橋接 (.ps1 + .bat)</span>
            </button>
          </div>
          {bridgeFeedback && (
            <p className="text-emerald-400 font-medium text-[11px]">{bridgeFeedback}</p>
          )}
          <ol className="list-decimal list-inside space-y-1 text-slate-400/90 leading-relaxed text-[11px]">
            <li>Windows 版：將下載的 <code className="text-slate-200 font-mono">ro_bridge_win.ps1</code> 與 <code className="text-slate-200 font-mono">start_ro_bridge.bat</code> 放同資料夾，雙擊 <code className="text-emerald-300 font-mono">.bat</code> 啟動</li>
            <li>在遊戲內面板「主控」→ 輸入模式改為 <code className="text-amber-300 font-mono">混合橋接</code>，按「測試連線」確認已連線即可</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

