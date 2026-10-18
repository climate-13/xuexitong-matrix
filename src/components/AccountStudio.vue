<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { commands, type Account } from "@/services/cmds";
import { useAccounts, mediaTime } from "@/composables/useAccounts";
import SharedSettings from "./SharedSettings.vue";
import brandIcon from "@/assets/brand/icon.svg?url";
import buildConfig from "../../config/build.json";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

const { accounts, running, pending, busy, error, clock, perform, refresh, add, run, batch, remove } = useAccounts();
const columns = ref(3);
const focusMode = ref(true);
const settings = ref(false);
const expanded = ref<number | null>(null);
const editor = ref<Account | null>(null);
const deleting = ref<Account | null>(null);
const confirmation = ref<Account | null>(null);
const editName = ref("");
const editUrl = ref("");
const toast = ref("");
const scrollArea = ref<HTMLElement>();
const expandedAccount = computed(() => accounts.value.find((a) => a.id === expanded.value));
const overlay = computed(() => settings.value || !!editor.value || !!deleting.value || !!confirmation.value);
let timer: ReturnType<typeof setInterval>;
let toastTimer: ReturnType<typeof setTimeout>;
let frame = 0;
let syncing = false;
let pendingLayout = false;
let observer: ResizeObserver;
let recoveryListeners: UnlistenFn[] = [];
let disposed = false;

async function reloadAccount(account: Account) {
  await perform(async () => {
    await commands.accountReload(account.id);
    await refresh();
    notify(account.name + " 正在重载，登录资料保留");
  });
}
async function home(account: Account) {
  await perform(async () => {
    await commands.accountNavigate(account.id, buildConfig.app.home_url);
    await refresh();
  });
}

async function layout() {
  if (syncing) { pendingLayout = true; return; }
  syncing = true;
  try {
    await nextTick();
    const views = [...document.querySelectorAll<HTMLElement>("[data-account-viewport]")];
    const rects = overlay.value ? [] : views.flatMap((el) => {
      const rect = el.getBoundingClientRect();
      const isExpanded = el.dataset.expanded === "true";
      if ((expanded.value !== null && !isExpanded) || (expanded.value === null && isExpanded)) return [];
      const host = isExpanded ? null : scrollArea.value?.getBoundingClientRect();
      if (rect.y < (host?.y ?? 0) || rect.bottom > (host?.bottom ?? innerHeight) || rect.x < 0 || rect.right > innerWidth) return [];
      return [{ id: Number(el.dataset.accountViewport), x: rect.x, y: rect.y, width: rect.width, height: rect.height, expanded: isExpanded }];
    });
    await commands.accountLayout(rects);
  } catch (cause) { error.value = String(cause); }
  finally {
    syncing = false;
    if (pendingLayout) { pendingLayout = false; scheduleLayout(); }
  }
}
function scheduleLayout() {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => void layout());
}
function notify(message: string) {
  toast.value = message; clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ""; }, 4000);
}
function edit(account: Account) {
  editor.value = account; editName.value = account.name; editUrl.value = account.url;
}
async function saveAccount() {
  if (!editor.value) return;
  const account = editor.value;
  await perform(async () => {
    await commands.accountRename(account.id, editName.value);
    if (editUrl.value.trim() !== account.url) await commands.accountNavigate(account.id, editUrl.value);
    editor.value = null; await refresh(); notify("账号信息已保存");
  });
}
async function deleteAccount() {
  if (!deleting.value) return;
  await remove(deleting.value.id);
  if (!error.value) { deleting.value = null; notify("已从控制台移除，登录资料保留在本机"); }
}
async function answer(value: boolean) {
  if (!confirmation.value) return;
  await perform(() => commands.accountAnswer(confirmation.value!.id, value));
  confirmation.value = null;
}
async function background() {
  await perform(() => commands.managerBackground());
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    if (settings.value) settings.value = false;
    else if (editor.value) editor.value = null;
    else if (deleting.value) deleting.value = null;
    else if (confirmation.value) confirmation.value = null;
    else expanded.value = null;
  }
}
function freshness(account: Account) {
  if (!account.heartbeat) return "等待画面连接";
  return "最近更新 " + Math.max(0, Math.floor((clock.value - account.heartbeat) / 1000)) + " 秒前";
}
function progress(account: Account) {
  const total = account.total ?? 0;
  return total > 0 ? Math.min(100, Math.max(0, (account.completed ?? 0) / total * 100)) : 0;
}
watch([columns, focusMode, expanded, overlay, () => accounts.value.map((a) => a.id).join(",")], scheduleLayout, { flush: "post" });
onMounted(() => {
  void Promise.all([
    listen("manager-overview", () => {
      expanded.value = null; settings.value = false; editor.value = null;
      deleting.value = null; confirmation.value = null; scheduleLayout();
    }),
    listen<string>("manager-recovery-error", ({ payload }) => { error.value = payload; }),
  ]).then((listeners) => {
    if (disposed) listeners.forEach((off) => off());
    else recoveryListeners = listeners;
  }).catch((cause) => { error.value = String(cause); });
  observer = new ResizeObserver(scheduleLayout);
  observer.observe(document.body);
  timer = setInterval(scheduleLayout, 2000);
  window.addEventListener("keydown", keydown);
  scheduleLayout();
});
onUnmounted(() => {
  disposed = true;
  recoveryListeners.forEach((off) => off());
  observer?.disconnect(); clearInterval(timer); clearTimeout(toastTimer); cancelAnimationFrame(frame);
  window.removeEventListener("keydown", keydown);
});
</script>

<template>
  <div class="studio" :class="{ 'focus-mode': focusMode && accounts.length > 0 }">
    <header class="topbar">
      <div class="brand"><img class="brand-mark" :src="brandIcon" alt="SK" /><span>{{ buildConfig.app.title }} <small>SK MATRIX</small></span></div>
      <div class="top-actions"><span class="version">{{ buildConfig.version }} · WINDOWS</span><button class="quiet" @click="focusMode = !focusMode">{{ focusMode ? "概览布局" : "画面优先" }}</button><button class="quiet" @click="settings = true">共享 API ↗</button><button class="dark" @click="background">↙ 一键后台</button></div>
    </header>
    <main ref="scrollArea" class="workspace" @scroll="scheduleLayout">
      <section class="hero">
        <div class="hero-copy"><div class="eyebrow">SK MATRIX / A QUIETER WAY TO MANAGE.</div><h1>所有账号。<br /><span>一眼看见。</span></h1><p>画面就在这里。让进度，自己说话。</p></div>
        <div class="summary-card sage"><span class="mini-label">ACCOUNTS</span><strong>{{ accounts.length.toString().padStart(2, "0") }}</strong><div>独立账号 <span class="sub">/ 登录资料各自保存</span></div></div>
        <div class="summary-card cream"><span class="mini-label">IN PROGRESS</span><strong>{{ running.toString().padStart(2, "0") }}<small> / {{ accounts.length }}</small></strong><div>任务已开启 <span class="sub">{{ pending ? "· " + pending + " 个等待确认" : "· 一个 API，统一管理" }}</span></div></div>
      </section>
      <section class="toolbar">
        <div><h2>账号拼盘 <span>{{ accounts.length }}</span></h2><p>实时网页画面 · 点击展开即可操作</p></div>
        <div class="tools"><div class="density" aria-label="每行卡片数量"><button v-for="n in [2,3,4]" :key="n" :class="{ selected: columns === n }" @click="columns = n">{{ n }} 列</button></div><button class="secondary" :disabled="busy || !accounts.length" @click="batch(false)">全部停止</button><button class="secondary" :disabled="busy || !accounts.length" @click="batch(true)">▶ 全部开始</button><button class="primary" :disabled="busy" @click="add">＋ 添加账号</button></div>
      </section>
      <div v-if="error" class="error-banner" role="alert"><span>{{ error }}</span><button @click="error = ''">×</button></div>
      <section v-if="!accounts.length" class="empty">
        <div class="empty-symbol">＋</div><h2>从第一个账号开始。</h2><p>添加账号，展开页面登录。每个账号都有独立的登录环境。</p><button class="primary" :disabled="busy" @click="add">{{ busy ? "正在创建…" : "添加第一个账号" }}</button>
      </section>
      <section v-else class="account-grid" :style="{ gridTemplateColumns: 'repeat(' + columns + ', minmax(0, 1fr))' }">
        <article v-for="(account, index) in accounts" :key="account.id" class="account-card" :class="{ featured: index === 0 && columns === 3 }">
          <div class="card-header"><div class="account-name"><span class="avatar" :class="'tint-' + index % 4">{{ account.name.slice(0, 1) }}</span><div><h3>{{ account.name }}</h3><span class="account-stage">{{ account.phase || "就绪" }}</span></div></div><div class="card-actions"><button title="账号设置与课程地址" @click="edit(account)">···</button><button title="移除账号" @click="deleting = account">−</button></div></div>
          <div class="live-caption"><span><i></i> LIVE VIEW</span><div><button title="重新加载此账号，保留登录资料" @click="reloadAccount(account)">↻ 重载</button><button @click="expanded = account.id">展开页面 ↗</button></div></div>
          <div class="viewport" :data-account-viewport="account.id"><div class="viewport-placeholder"><span>实时页面</span><small>滚动至完整画面，或展开查看</small></div></div>
          <div class="media-strip"><span>视频时间 <b>{{ mediaTime(account.mediaTime) }}</b><span v-if="account.mediaDuration"> / {{ mediaTime(account.mediaDuration) }}</span></span><span>{{ freshness(account) }}</span></div>
          <div class="card-content"><div class="chapter-line" :title="account.chapter">{{ account.chapter || "尚未进入课程" }}</div><div class="detail-line" :title="account.detail">{{ account.task || account.detail || "登录后选择课程，再开启任务" }}</div><div class="progress-track"><div :style="{ width: progress(account) + '%' }"></div></div><div class="card-bottom"><span>{{ account.total ? account.completed + " / " + account.total + " 章节" : "等待课程进度" }}</span><button v-if="account.confirmation" class="attention" @click="confirmation = account">查看确认</button><button v-else :class="account.running ? 'stop' : 'start'" :disabled="busy" @click="run(account.id, !account.running)">{{ account.running ? "Ⅱ 停止" : "▶ 开始" }}</button></div></div>
        </article>
        <button class="add-card" :disabled="busy" @click="add"><span>＋</span><strong>再添一个。</strong><small>独立登录 · 统一管理</small></button>
      </section>
      <footer class="footnote"><span>一个窗口，多个独立账号。画面是否在动，由你直接看。</span><span>最小化继续运行 · 关闭窗口退出</span></footer>
    </main>
    <div v-if="expandedAccount" class="expanded-layer">
      <header><div><span class="eyebrow">ACCOUNT WORKSPACE</span><h2>{{ expandedAccount.name }}</h2></div><div class="expanded-tools"><span>{{ expandedAccount.phase }}</span><button class="secondary" @click="reloadAccount(expandedAccount)">↻ 重新加载</button><button class="secondary" @click="home(expandedAccount)">返回选课</button><button class="secondary" @click="edit(expandedAccount)">课程地址 / 设置</button><button :class="expandedAccount.running ? 'secondary' : 'primary'" @click="run(expandedAccount.id, !expandedAccount.running)">{{ expandedAccount.running ? "停止任务" : "开始任务" }}</button><button class="dark" @click="expanded = null">返回拼盘 ×</button></div></header>
      <p v-if="error" class="recovery-error" role="alert">{{ error }}</p>
      <div class="expanded-viewport" :data-account-viewport="expandedAccount.id" data-expanded="true"></div>
      <footer>页面卡住：顶部“页面恢复”菜单可返回拼盘或重载当前账号。登录资料保留。<span>视频时间 {{ mediaTime(expandedAccount.mediaTime) }}</span></footer>
    </div>
    <div v-if="overlay" class="dialog-shade">
      <div class="dialog" role="dialog" aria-modal="true">
        <SharedSettings v-if="settings" @close="settings = false" @saved="settings = false; notify('全部账号已共用这份 API 配置')" />
        <section v-else-if="editor" class="simple-dialog"><div class="eyebrow">ACCOUNT SETTINGS</div><h2>账号，按你的方式。</h2><label>账号备注<input v-model="editName" maxlength="40" /></label><label>超星页面 / 课程链接<input v-model="editUrl" type="url" /></label><p>修改链接会停止该账号当前任务并打开新页面。也可以展开页面直接选课。</p><div class="dialog-actions"><button class="secondary" @click="editor = null">取消</button><button class="primary" @click="saveAccount">保存</button></div></section>
        <section v-else-if="deleting" class="simple-dialog"><div class="eyebrow">REMOVE ACCOUNT</div><h2>移除 {{ deleting.name }}？</h2><p>该账号的任务将停止，并从拼盘移除。本机登录资料保留；不会操作平台上的账号或课程。</p><div class="dialog-actions"><button class="secondary" @click="deleting = null">保留</button><button class="danger" @click="deleteAccount">停止并移除</button></div></section>
        <section v-else-if="confirmation" class="simple-dialog"><div class="eyebrow">{{ confirmation.name }} · NEEDS YOUR INPUT</div><h2>有一步需要你确认。</h2><p class="confirmation-text">{{ confirmation.confirmation }}</p><div class="dialog-actions"><button class="secondary" @click="answer(false)">取消</button><button class="primary" @click="answer(true)">确认继续</button></div></section>
        <p v-if="error" class="dialog-error">{{ error }}</p>
      </div>
    </div>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style>
.studio { color: #252a23; background: #f5f5f2; width: 100vw; height: 100vh; font-family: "Segoe UI", "Microsoft YaHei", sans-serif; font-size: 14px; -webkit-text-stroke: 0; line-height: 1.5; }
.studio button { cursor: pointer; border: 0; transition: background .15s, transform .15s; font-size: 12px; white-space: nowrap; }
.studio button:disabled { opacity: .45; cursor: wait; }
.studio button:focus-visible,.studio input:focus-visible,.studio select:focus-visible { outline: 2px solid #788c66; outline-offset: 3px; }
.studio button:active:not(:disabled) { transform: scale(.98); }
.topbar { height: 72px; padding: 0 36px; display: flex; align-items: center; justify-content: space-between; background: #fbfbf9; border-bottom: 1px solid #e9eae3; }
.brand { display: flex; gap: 12px; align-items: center; font-size: 17px; letter-spacing: -.04em; font-weight: 650; }
.brand-mark { display: grid; place-items: center; width: 32px; height: 32px; background: #303e2e; color: white; font-size: 24px; border-radius: 10px; }
.brand small { font-size: 9px; font-weight: 500; letter-spacing: .15em; margin-left: 6px; color: #92968b; }
.top-actions { display: flex; gap: 12px; align-items: center; }
.version { font-size: 11px; color: #9a9e94; margin-right: 10px; }
.quiet { padding: 10px; background: none; color: #5a6552; }
.dark,.primary,.secondary,.danger { padding: 11px 18px; border-radius: 30px; font-weight: 550; }
.dark { color: white; background: #2d332c; }
.primary { color: white; background: #687e58; }
.secondary { color: #606a58; background: #e9ede4; }
.danger { background: #ac6052; color: white; }
.workspace { height: calc(100vh - 72px); overflow-y: auto; padding: 32px 36px 18px; }
.hero { display: grid; grid-template-columns: 1.4fr 1fr 1fr; gap: 18px; margin-bottom: 32px; }
.eyebrow { color: #8c9286; font-size: 9px; letter-spacing: .16em; }
.hero-copy { padding: 8px 8px 8px 0; }
.hero h1 { font-size: clamp(30px, 3.2vw, 48px); line-height: 1.17; letter-spacing: -.065em; font-weight: 600; margin: 12px 0; }
.hero h1 span { color: #7a8970; }
.hero-copy p { color: #92968b; font-size: 12px; margin: 10px 0 0; }
.summary-card { border-radius: 25px; padding: 25px 28px; display: flex; flex-direction: column; justify-content: space-between; min-height: 184px; }
.sage { background: #e6ebdf; } .cream { background: #eeeae0; }
.mini-label { color: #849076; font-size: 9px; letter-spacing: .15em; }
.summary-card strong { display: block; color: #4b5c40; font-size: 58px; font-weight: 400; line-height: 1.2; letter-spacing: -.065em; margin: 8px 0; }
.cream strong { color: #746753; } .summary-card strong small { font-size: 22px; color: #ada594; letter-spacing: -.03em; }
.summary-card>div { font-size: 12px; color: #6e7767; }
.sub { color: #93998b; font-size: 10px; margin-left: 7px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: 19px; }
.toolbar h2 { font-size: 19px; font-weight: 550; letter-spacing: -.04em; }
.toolbar h2 span { margin-left: 6px; color: #a0a598; font-weight: 400; font-size: 12px; }
.toolbar p { color: #9b9f95; font-size: 10px; margin-top: 3px; }
.tools { display: flex; gap: 8px; align-items: center; }
.density { display: flex; background: #eaece5; border-radius: 20px; padding: 3px; margin-right: 4px; }
.density button { color: #91978a; padding: 6px 10px; background: none; border-radius: 20px; font-size: 10px; }
.density button.selected { background: #fff; color: #59684c; box-shadow: 0 1px 3px #00000008; }
.account-grid { display: grid; gap: 18px; }
.account-card { min-width: 0; border-radius: 23px; background: #fff; overflow: hidden; border: 1px solid #e9eae5; }
.account-card.featured { grid-column: span 2; }
.card-header { display: flex; align-items: center; justify-content: space-between; padding: 17px 20px 12px; }
.account-name { display: flex; align-items: center; gap: 10px; min-width: 0; }
.avatar { width: 34px; height: 34px; border-radius: 12px; display: grid; place-items: center; font-size: 13px; color: #708366; background: #e9eee4; }
.tint-1 { background: #f1e9df; color: #9c8264; }.tint-2 { background: #e4eaf0; color: #708699; }.tint-3 { background: #eee5e7; color: #a1848c; }
.account-name h3 { font-size: 13px; font-weight: 550; max-width: 14vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-stage { display: block; font-size: 9px; color: #9ba193; margin-top: 2px; }
.card-actions { display: flex; gap: 4px; }.card-actions button { color: #92978b; background: #f5f6f2; border-radius: 20px; width: 27px; height: 27px; font-size: 18px; }
.live-caption { padding: 0 20px 9px; display: flex; justify-content: space-between; align-items: center; color: #949c8c; font-size: 8px; letter-spacing: .13em; }
.live-caption span { display: flex; align-items: center; gap: 5px; }.live-caption i { width: 4px; height: 4px; border-radius: 50%; background: #8d9c7d; }
.live-caption button { background: none; color: #98a08e; font-size: 9px; }
.viewport { height: clamp(180px, 18vw, 280px); margin: 0 12px; background: #171b17; position: relative; }
.viewport-placeholder { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #697364; gap: 8px; font-size: 12px; }.viewport-placeholder small { font-size: 9px; }
.media-strip { display: flex; justify-content: space-between; padding: 9px 20px 0; color: #a2a69c; font-size: 9px; font-variant-numeric: tabular-nums; }.media-strip b { color: #747e69; font-weight: 500; }
.card-content { padding: 14px 20px 17px; }.chapter-line { font-size: 12px; color: #5a6352; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.detail-line { font-size: 10px; color: #a0a595; margin-top: 4px; height: 15px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.progress-track { background: #f0f2ec; height: 3px; border-radius: 3px; margin: 13px 0; }.progress-track div { height: 3px; background: #9cae8c; border-radius: 3px; transition: width .3s; }
.card-bottom { display: flex; align-items: center; justify-content: space-between; }.card-bottom>span { color: #a2a798; font-size: 9px; }.card-bottom button { border-radius: 20px; padding: 6px 13px; font-size: 10px; }.start { background: #edf2e7; color: #70845f; }.stop { background: #f0eee8; color: #9a8b70; }.attention { background: #fff1d8; color: #9a792f; }
.add-card { min-height: 200px; background: #eeefea; border: 1px dashed #d7ddce !important; border-radius: 23px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: #89967b; }.add-card>span { font-size: 30px; font-weight: 200; }.add-card strong { font-size: 16px; font-weight: 400; }.add-card small { font-size: 10px; color: #a0a796; }
.empty { text-align: center; background: #fff; border: 1px solid #e7ebe1; border-radius: 25px; padding: 45px; }.empty-symbol { font-size: 40px; font-weight: 200; color: #a1b38f; }.empty h2 { margin: 10px 0; font-size: 23px; font-weight: 450; }.empty p { color: #939b8a; font-size: 12px; margin-bottom: 23px; }
.footnote { display: flex; justify-content: space-between; gap: 20px; margin-top: 26px; color: #a6aa9f; font-size: 9px; }
.expanded-layer { position: fixed; inset: 0; z-index: 10; background: #f5f5f2; padding: 24px; display: flex; flex-direction: column; gap: 18px; }.expanded-layer>header { flex-wrap: wrap; gap: 10px; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; min-height: 60px; }.expanded-layer h2 { font-size: 23px; margin-top: 4px; font-weight: 500; }.expanded-tools { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; align-items: center; }.expanded-tools>span { font-size: 11px; color: #929a86; }.expanded-viewport { flex: 1; background: #fff; min-height: 0; }.expanded-layer>footer { font-size: 10px; color: #979f8d; display: flex; justify-content: space-between; }
.recovery-error { color: #a56858; font-size: 12px; margin: 0; }
.live-caption>div { display: flex; gap: 12px; }
.dialog-shade { position: fixed; inset: 0; z-index: 30; background: #2a322637; backdrop-filter: blur(12px); display: flex; justify-content: center; align-items: center; }.dialog { width: min(660px, 85vw); max-height: 90vh; overflow-y: auto; border-radius: 27px; background: #fff; box-shadow: 0 30px 100px #202b2020; }
.simple-dialog { padding: 38px; }.simple-dialog h2 { font-size: 27px; font-weight: 500; margin: 10px 0 23px; letter-spacing: -.04em; }.simple-dialog label { display: flex; flex-direction: column; gap: 8px; font-size: 12px; color: #838c77; margin-top: 18px; }.simple-dialog input { border: 1px solid #e2e6db; border-radius: 12px; background: #f8f9f5; height: 45px; padding: 0 12px; color: #59674c; font-size: 12px; }.simple-dialog p { font-size: 12px; line-height: 1.8; color: #969d8b; margin-top: 18px; }.dialog-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 28px; }.confirmation-text { white-space: pre-wrap; max-height: 40vh; overflow: auto; }.dialog-error { color: #a65c4e; font-size: 12px; padding: 0 38px 25px; }
.error-banner { margin-bottom: 15px; padding: 12px 16px; border-radius: 12px; color: #a56858; background: #f3e9e4; font-size: 12px; display: flex; align-items: center; justify-content: space-between; }.error-banner button { background: none; font-size: 20px; color: #a56858; }
.toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 50; background: #303a2c; color: #f1f5ec; border-radius: 25px; padding: 13px 25px; box-shadow: 0 8px 30px #24301c22; font-size: 12px; }
.focus-mode .hero { display: none; }
.focus-mode .account-card.featured { grid-column: span 1; }
.focus-mode .card-header { padding: 10px 14px 6px; }
.focus-mode .avatar { width: 28px; height: 28px; border-radius: 9px; }
.focus-mode .live-caption { padding: 0 14px 6px; }
.focus-mode .viewport { height: clamp(100px, 10vw, 160px); }
.focus-mode .media-strip { padding: 6px 14px 0; }
.focus-mode .card-content { padding: 8px 14px 11px; }
.focus-mode .detail-line,.focus-mode .progress-track { display: none; }
.focus-mode .card-bottom { margin-top: 7px; }
@media (max-width: 1100px) { .topbar { padding: 0 24px; }.workspace { padding: 24px; }.hero { gap: 12px; }.summary-card { padding: 20px; }.tools { gap: 5px; }.density { display: none; }.sub { display: block; margin: 3px 0 0; }.media-strip { padding-left: 12px; padding-right: 12px; font-size: 8px; } }
</style>
