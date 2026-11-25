using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.NetworkInformation;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using (var manager = new ServerManager()) Application.Run(manager);
    }
}

internal sealed class ServerManager : Form
{
    private const string Launcher = @"deploy\windows\start-site.mjs";
    private const string ProductionBuild = @"apps\web\.next\BUILD_ID";
    private static readonly Uri LocalHealth = new Uri("http://127.0.0.1:8080/api/health");
    private static readonly Uri PublicHealth = new Uri("https://stepmark.xin/api/health");
    private static readonly string SettingsFile = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "StepMark", "server-manager-root.txt");

    private readonly TextBox root = new TextBox { ReadOnly = true, Dock = DockStyle.Fill };
    private readonly TextBox output = new TextBox {
        Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical, Dock = DockStyle.Fill
    };
    private readonly Label processStatus = StatusLabel();
    private readonly Label localStatus = StatusLabel();
    private readonly Label publicStatus = StatusLabel();
    private readonly Button choose = ActionButton("选择项目目录");
    private readonly Button start = ActionButton("启动");
    private readonly Button stop = ActionButton("停止");
    private readonly Button restart = ActionButton("重启");
    private readonly Button probe = ActionButton("检查公网");
    private readonly Button testAi = ActionButton("测试 DeepSeek");
    private readonly Timer timer = new Timer { Interval = 4000 };
    private readonly HttpClient localClient = HealthClient(false);
    private readonly HttpClient publicClient = HealthClient(true);
    private Process site;
    private bool busy;
    private bool localCheck;
    private bool portOccupied;
    private bool aiCheck;

    public ServerManager()
    {
        Text = "StepMark 服务器管理";
        Font = new Font("Microsoft YaHei UI", 10);
        BackColor = Color.FromArgb(247, 249, 247);
        ClientSize = new Size(850, 550);
        MinimumSize = new Size(690, 470);
        StartPosition = FormStartPosition.CenterScreen;
        AutoScaleMode = AutoScaleMode.Dpi;

        var layout = new TableLayoutPanel {
            Dock = DockStyle.Fill, Padding = new Padding(20),
            ColumnCount = 2, RowCount = 6
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.AutoSize));
        for (int index = 0; index < 5; index++) layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        var title = new Label {
            Text = "网站服务", Font = new Font(Font.FontFamily, 19, FontStyle.Bold),
            AutoSize = true, Margin = new Padding(0, 0, 0, 12), ForeColor = Color.FromArgb(22, 58, 43)
        };
        layout.Controls.Add(title, 0, 0);
        layout.SetColumnSpan(title, 2);
        layout.Controls.Add(root, 0, 1);
        layout.Controls.Add(choose, 1, 1);

        var status = new TableLayoutPanel { Dock = DockStyle.Fill, AutoSize = true, ColumnCount = 3, RowCount = 1 };
        for (int index = 0; index < 3; index++) status.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 33.333f));
        status.Controls.Add(processStatus, 0, 0);
        status.Controls.Add(localStatus, 1, 0);
        status.Controls.Add(publicStatus, 2, 0);
        layout.Controls.Add(status, 0, 2);
        layout.SetColumnSpan(status, 2);

        var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true };
        var open = ActionButton("打开本机网页");
        actions.Controls.AddRange(new Control[] { start, stop, restart, testAi, probe, open });
        layout.Controls.Add(actions, 0, 3);
        layout.SetColumnSpan(actions, 2);
        var logLabel = new Label { Text = "服务日志", AutoSize = true, Margin = new Padding(0, 10, 0, 6) };
        layout.Controls.Add(logLabel, 0, 4);
        layout.Controls.Add(output, 0, 5);
        layout.SetColumnSpan(output, 2);
        Controls.Add(layout);

        root.Text = FindInitialRoot();
        publicStatus.Text = "公网 HTTPS\n待检查";
        choose.Click += delegate { ChooseRoot(); };
        start.Click += async delegate { await RunAction(StartSite); };
        stop.Click += async delegate { await RunAction(async () => { await StopSite(); }); };
        restart.Click += async delegate {
            await RunAction(async () => { if (await StopSite()) await StartSite(); });
        };
        testAi.Click += async delegate { await CheckAi(); };
        probe.Click += async delegate {
            probe.Enabled = false;
            try { publicStatus.Text = "公网 HTTPS\n" + await CheckHealth(publicClient, PublicHealth); }
            finally { if (!IsDisposed) probe.Enabled = true; }
        };
        open.Click += delegate {
            try { Process.Start(new ProcessStartInfo("http://127.0.0.1:8080") { UseShellExecute = true }); }
            catch { Log("无法打开默认浏览器。"); }
        };
        timer.Tick += async delegate { await RefreshLocal(); };
        Shown += async delegate { timer.Start(); await RefreshLocal(); };
        FormClosing += delegate(object sender, FormClosingEventArgs args) {
            if (args.CloseReason == CloseReason.UserClosing && (busy || aiCheck || OwnsSite())) {
                args.Cancel = true;
                WindowState = FormWindowState.Minimized;
                Log("管理器已最小化。停止网站后可关闭窗口。");
            }
        };
        UpdateControls();
    }

    private static Label StatusLabel()
    {
        return new Label {
            AutoSize = false, Height = 70, Dock = DockStyle.Top, Padding = new Padding(10, 8, 8, 0),
            Margin = new Padding(0, 10, 7, 8), BackColor = Color.White
        };
    }

    private static Button ActionButton(string caption)
    {
        return new Button { Text = caption, AutoSize = true, MinimumSize = new Size(78, 32) };
    }

    private static HttpClient HealthClient(bool proxy)
    {
        return new HttpClient(new HttpClientHandler { UseProxy = proxy, AllowAutoRedirect = false }) {
            Timeout = TimeSpan.FromSeconds(5), MaxResponseContentBufferSize = 4096
        };
    }

    private static async Task<string> CheckHealth(HttpClient client, Uri endpoint)
    {
        try {
            using (var response = await client.GetAsync(endpoint)) {
                if (!response.IsSuccessStatusCode) return "HTTP " + (int)response.StatusCode;
                string body = await response.Content.ReadAsStringAsync();
                var health = new JavaScriptSerializer().Deserialize<Dictionary<string, string>>(body);
                string service, status;
                return health != null && health.TryGetValue("service", out service) && service == "stepmark-web"
                    && health.TryGetValue("status", out status) && status == "ok"
                    ? "StepMark 正常" : "返回内容不是健康状态";
            }
        } catch (HttpRequestException) { }
        catch (TaskCanceledException) { }
        catch (ArgumentException) { }
        catch (InvalidOperationException) { }
        return "当前无法确认健康状态";
    }

    private static bool IsProject(string directory)
    {
        return !String.IsNullOrEmpty(directory) && File.Exists(Path.Combine(directory, Launcher))
            && File.Exists(Path.Combine(directory, "apps", "web", "package.json"));
    }

    private static string FindInitialRoot()
    {
        try {
            var saved = File.Exists(SettingsFile) ? File.ReadAllText(SettingsFile).Trim() : "";
            if (IsProject(saved)) return saved;
        } catch (IOException) { } catch (UnauthorizedAccessException) { }
        var here = new DirectoryInfo(AppDomain.CurrentDomain.BaseDirectory);
        while (here != null) {
            if (IsProject(here.FullName)) return here.FullName;
            here = here.Parent;
        }
        return "";
    }

    private void ChooseRoot()
    {
        using (var dialog = new FolderBrowserDialog { Description = "选择 StepMark 源码根目录", SelectedPath = root.Text }) {
            if (dialog.ShowDialog(this) != DialogResult.OK) return;
            if (!IsProject(dialog.SelectedPath)) {
                Log("请选择包含 apps\\web 和 deploy\\windows 的 StepMark 项目根目录。");
                return;
            }
            root.Text = dialog.SelectedPath;
            try {
                Directory.CreateDirectory(Path.GetDirectoryName(SettingsFile));
                File.WriteAllText(SettingsFile, root.Text);
            } catch (IOException) { Log("已选择目录。下次启动时可能需要重新选择。"); }
            catch (UnauthorizedAccessException) { Log("已选择目录。下次启动时可能需要重新选择。"); }
        }
        UpdateControls();
    }

    private bool OwnsSite() { return site != null && !site.HasExited; }

    private void UpdateControls()
    {
        bool owned = OwnsSite();
        choose.Enabled = !busy && !aiCheck && !owned;
        testAi.Enabled = !busy && !aiCheck && IsProject(root.Text);
        start.Enabled = !busy && !owned && !portOccupied && IsProject(root.Text);
        stop.Enabled = restart.Enabled = !busy && owned;
        processStatus.Text = "网站进程\n" + (owned ? "正在运行 · PID " + site.Id : "未启动");
    }

    private async Task RefreshLocal()
    {
        if (localCheck || busy || IsDisposed) return;
        localCheck = true;
        try {
            if (site != null && site.HasExited) {
                Log("网站进程已退出，代码 " + site.ExitCode + "。");
                site.Dispose();
                site = null;
            }
            portOccupied = IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners()
                .Any(endpoint => endpoint.Port == 8080);
            var message = portOccupied ? await CheckHealth(localClient, LocalHealth) : "端口未监听";
            if (IsDisposed) return;
            if (portOccupied && !OwnsSite()) message += " · 由其它进程管理";
            localStatus.Text = "本机回源 · 8080\n" + message;
            UpdateControls();
        } catch (NetworkInformationException) { localStatus.Text = "本机回源 · 8080\n端口状态暂不可读"; }
        finally { localCheck = false; }
    }

    private async Task RunAction(Func<Task> action)
    {
        if (busy) return;
        busy = true;
        UpdateControls();
        try { await action(); }
        catch { Log("操作未完成。请检查 Node.js、项目目录和日志。"); }
        finally { busy = false; UpdateControls(); }
        await RefreshLocal();
    }

    private static string FindNode()
    {
        foreach (var entry in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator)) {
            string directory = entry.Trim().Trim('"');
            if (!Path.IsPathRooted(directory)) continue;
            string candidate = Path.Combine(directory, "node.exe");
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private Task StartSite()
    {
        if (OwnsSite()) return Task.FromResult(false);
        if (IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners().Any(address => address.Port == 8080)) {
            Log("8080 已被其它进程占用。管理器只启停自己启动的网站。");
            return Task.FromResult(false);
        }
        if (!File.Exists(Path.Combine(root.Text, ProductionBuild))) {
            Log("找不到生产构建。请在项目根目录先完成 npm ci、生成 Prisma 客户端和 npm run build。");
            return Task.FromResult(false);
        }
        string node = FindNode();
        if (node == null) { Log("PATH 里没有 Node.js，请安装 Node.js 22 或更新版本。"); return Task.FromResult(false); }
        if (site != null) { site.Dispose(); site = null; }
        var child = new Process {
            StartInfo = new ProcessStartInfo(node, Launcher) {
                WorkingDirectory = root.Text, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardInput = true, RedirectStandardOutput = true, RedirectStandardError = true,
                StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
            }
        };
        child.OutputDataReceived += delegate(object sender, DataReceivedEventArgs args) { QueueLog(args.Data); };
        child.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs args) { QueueLog(args.Data); };
        if (!child.Start()) { child.Dispose(); throw new InvalidOperationException(); }
        site = child;
        site.BeginOutputReadLine();
        site.BeginErrorReadLine();
        Log("已请求启动，等待站点预检和本机回源检查。");
        return Task.FromResult(true);
    }

    private async Task CheckAi()
    {
        if (aiCheck) return;
        string node = FindNode();
        if (node == null) { Log("PATH 中没有 Node.js，请安装 Node.js 24.14 或更新版本。"); return; }
        const string script = @"apps\web\scripts\check-ai.ts";
        if (!File.Exists(Path.Combine(root.Text, script))) { Log("项目缺少 DeepSeek 测试脚本，请更新项目代码。"); return; }
        aiCheck = true;
        UpdateControls();
        try {
            using (var child = new Process {
                StartInfo = new ProcessStartInfo(node, "--import tsx " + script) {
                    WorkingDirectory = root.Text, UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardOutput = true, RedirectStandardError = true,
                    StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
                }
            }) {
                Log("正在用网页后台的密钥向 DeepSeek 发送最小测试请求。");
                if (!child.Start()) throw new InvalidOperationException();
                Task<string> stdout = child.StandardOutput.ReadToEndAsync();
                Task<string> stderr = child.StandardError.ReadToEndAsync();
                if (!await Task.Run(() => child.WaitForExit(30000))) {
                    if (!child.HasExited) child.Kill();
                    await Task.Run(() => child.WaitForExit(3000));
                    Log("DeepSeek 测试超时，请检查网络和代理。");
                    return;
                }
                // The script emits only fixed diagnostics, never keys or model content.
                foreach (string line in ((await stdout) + "\n" + (await stderr)).Split('\n')) {
                    string clean = line.Trim();
                    if (clean.StartsWith("DeepSeek ") || clean.StartsWith("诊断代码：")) Log(clean);
                }
                if (child.ExitCode != 0) Log("DeepSeek 测试未通过，网站服务状态不受影响。");
            }
        } catch { Log("无法执行 DeepSeek 测试，请检查 Node.js、项目依赖和目录权限。"); }
        finally { aiCheck = false; if (!IsDisposed) UpdateControls(); }
    }

    private async Task<bool> StopSite()
    {
        if (!OwnsSite()) return true;
        var child = site;
        Log("正在停止管理器启动的网站。");
        try { child.StandardInput.WriteLine("stop"); child.StandardInput.Flush(); }
        catch (IOException) { } catch (InvalidOperationException) { }
        if (!await Task.Run(() => child.WaitForExit(8000))) {
            if (!child.HasExited) child.Kill();
            if (!await Task.Run(() => child.WaitForExit(3000))) {
                Log("进程仍在退出，请稍后重试。");
                return false;
            }
        }
        child.Dispose();
        site = null;
        Log("网站已停止。");
        return true;
    }

    private void QueueLog(string line)
    {
        if (String.IsNullOrEmpty(line) || IsDisposed || !IsHandleCreated) return;
        try { BeginInvoke((Action)(() => Log(line))); } catch (InvalidOperationException) { }
    }

    private void Log(string line)
    {
        if (IsDisposed) return;
        string safe = Regex.Replace(line, @"(?i)(postgres(?:ql)?://\S+|\bsk-[a-z0-9_-]{12,}|\bBearer\s+\S+)", "[已隐去]");
        if (output.TextLength > 32000) output.Text = output.Text.Substring(output.TextLength - 24000);
        output.AppendText(DateTime.Now.ToString("HH:mm:ss  ") + safe + Environment.NewLine);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) {
            timer.Dispose();
            localClient.Dispose();
            publicClient.Dispose();
            if (site != null) site.Dispose();
        }
        base.Dispose(disposing);
    }
}
