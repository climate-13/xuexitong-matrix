import { computed, onMounted, onUnmounted, ref } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { commands, type Account } from "@/services/cmds";

export function useAccounts() {
  const accounts = ref<Account[]>([]);
  const busy = ref(false);
  const error = ref("");
  const clock = ref(Date.now());
  let unlisten: UnlistenFn | undefined;
  let timer: ReturnType<typeof setInterval>;
  const running = computed(() => accounts.value.filter((a) => a.running).length);
  const pending = computed(() => accounts.value.filter((a) => a.confirmation).length);

  async function perform(action: () => Promise<unknown>) {
    error.value = "";
    try { await action(); } catch (cause) { error.value = String(cause); }
  }
  async function refresh() { accounts.value = await commands.accountList(); }
  async function add() {
    busy.value = true;
    await perform(async () => { await commands.accountAdd(); await refresh(); });
    busy.value = false;
  }
  async function run(id: number, value: boolean) {
    await perform(async () => { await commands.accountRun(id, value); await refresh(); });
  }
  async function batch(value: boolean) {
    busy.value = true;
    const failures: string[] = [];
    for (const a of [...accounts.value]) {
      // Stop also pauses a manually playing page whose automation was never started.
      if (value && a.running) continue;
      try { await commands.accountRun(a.id, value); }
      catch (cause) { failures.push(a.name + "：" + String(cause)); }
    }
    await perform(refresh);
    error.value = failures.join("；");
    busy.value = false;
  }
  async function remove(id: number) {
    await perform(async () => {
      const a = accounts.value.find((item) => item.id === id);
      if (a?.running) await commands.accountRun(id, false);
      await commands.accountRemove(id);
      await refresh();
    });
  }
  onMounted(async () => {
    await perform(async () => {
      unlisten = await listen<Account>("account-update", ({ payload }) => {
        const index = accounts.value.findIndex((a) => a.id === payload.id);
        if (index >= 0) accounts.value[index] = payload;
      });
      await refresh();
    });
    timer = setInterval(() => { clock.value = Date.now(); }, 1000);
  });
  onUnmounted(() => { unlisten?.(); clearInterval(timer); });
  return { accounts, running, pending, busy, error, clock, perform, refresh, add, run, batch, remove };
}

export function mediaTime(value: number | null | undefined): string {
  value = value ?? 0;
  if (!Number.isFinite(value) || value < 0) return "00:00";
  const seconds = Math.floor(value);
  return Math.floor(seconds / 60).toString().padStart(2, "0") + ":" + (seconds % 60).toString().padStart(2, "0");
}
