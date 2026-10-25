// Public CLI envelope decisions; never persist credentials or assume a TTY/keyring.
export const RECOVERY_HELP = '使用原 A3 恢复码，或仍能解锁同一库的可信设备上的恢复资料。缺少材料、旧版密钥或需要 TOTP 时，请在宿主终端运行 rsrs login --interactive，或使用 rsrs login 的浏览器授权。离线新钥匙不能恢复原云端数据。';

export function capabilityView(value) {
  const c=value?.capabilities;
  if(value?.schema_version!==1||typeof value.cli_version!=='string'||!value.cli_version
    ||typeof c?.rerank!=='boolean'||typeof c?.model?.install!=='boolean'||typeof c?.model?.install_rerank!=='boolean') {
    return {state:'unknown',message:'无法确认 CLI 能力，请更新 CLI；不会启用精排安装。'};
  }
  return c.rerank===false&&c.model.install_rerank===false
    ? {state:'retired',message:'当前 CLI 已退役精排安装。'}
    : {state:'unsupported-client',message:'此客户端不提供精排安装。'};
}

export function loginOutcome(value) {
  if(value?.command!=='login'||value?.summary?.ok!==true||!['ok','warn'].includes(value.status)) {
    throw new Error(value?.status==='pending'?'登录尚未完成，请先在宿主核对状态。':'登录结果没有明确确认成功，请先在宿主核对状态。');
  }
  const issued=value.summary.super_issued;
  if(issued!=null&&typeof issued!=='string')throw new Error('恢复材料字段无效，请在宿主核对状态。');
  if(value.status==='warn')return {kind:'warning',superIssued:issued||null,message:'CLI 已提交账号但仍有警告，请确认所选账号及同步状态。'};
  return issued?{kind:'issued',superIssued:issued}:{kind:'complete'};
}

export function registrationOutcome(value) {
  if(value?.command!=='register'||value.status!=='ok'||typeof value.summary?.super!=='string'||!value.summary.super) {
    throw new Error('注册未返回已确认的恢复材料，请先在宿主核对状态。');
  }
  return {user:value.summary.user,superIssued:value.summary.super};
}

export function safeAccountError(error,secrets=[]) {
  let message=typeof error==='string'?error:typeof error?.message==='string'?error.message:'登录操作未完成，请在宿主核对状态。';
  for(const secret of secrets)if(typeof secret==='string'&&secret)message=message.split(secret).join('[已隐藏]');
  return message.replace(/A3-[A-Za-z0-9-]+/g,'[恢复码已隐藏]').slice(0,400);
}

export function createAccountRequestGate() {
  let serial=0,pending=false,closed=false;
  return {
    begin(){if(closed||pending)return null;pending=true;return ++serial},
    current(id){return !closed&&pending&&id===serial},
    finish(id){if(!this.current(id))return false;pending=false;return true},
    close(){if(pending)return false;closed=true;serial++;return true},
    dispose(){closed=true;pending=false;serial++},
    get busy(){return pending},
  };
}
