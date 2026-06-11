import { appendFileSync } from "fs";

const host = process.env.HOST || "ikuuu.win";

const checkInUrl = `https://${host}/user/checkin`;

// 签到
async function checkIn(account) {
  const response = await fetch(checkInUrl, {
    method: "POST",
    headers: {
      Cookie: account.cookie,
    },
  });

  if (!response.ok) {
    throw new Error(`网络请求出错 - ${response.status}`);
  }

  const data = await response.json();
  console.log(`${account.name}: ${data.msg}`);

  return data.msg;
}

// 处理
async function processSingleAccount(account) {

  const checkInResult = await checkIn(account);

  return checkInResult;
}

function setGitHubOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}<<EOF\n${value}\nEOF\n`);
  } else {
    console.log(`[Local Output] ${name}:\n${value}`);
  }
}

// 发送微信推送 (PushPlus)
async function sendWechat(title, msg) {
  const sendToken = process.env.SEND_TOKEN;
  if (!sendToken) {
    console.log("未配置 SEND_TOKEN，跳过 PushPlus 推送。");
    return;
  }

  try {
    const response = await fetch("https://www.pushplus.plus/send/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: sendToken,
        title: title,
        content: msg,
      }),
    });
    if (response.ok) {
      console.log("PushPlus 推送成功。");
    } else {
      console.error(`PushPlus 推送失败: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error(`PushPlus 推送出错: ${error.message}`);
  }
}

// 入口
async function main() {

  let accounts;

  try {
    if (!process.env.ACCOUNTS) {
      throw new Error("❌ 未配置账户信息。");
    }

    accounts = JSON.parse(process.env.ACCOUNTS);
  } catch (error) {
    const message = `❌ ${error.message.includes("JSON") ? "账户信息配置格式错误。" : error.message
      }`;
    console.error(message);
    setGitHubOutput("result", message);
    process.exit(1);
  }

  const allPromises = accounts.map((account) => processSingleAccount(account));
  const results = await Promise.allSettled(allPromises);

  const msgHeader = "\n======== 签到结果 ========\n\n";
  console.log(msgHeader);

  let hasError = false;

  const resultLines = results.map((result, index) => {
    const accountName = accounts[index].name;

    const isSuccess = result.status === "fulfilled";

    if (!isSuccess) {
      hasError = true;
    }

    const icon = isSuccess ? "✅" : "❌";
    const message = isSuccess ? result.value : result.reason.message;

    const line = `${accountName}: ${icon} ${message}`;

    isSuccess ? console.log(line) : console.error(line);

    return line;
  });

  const resultMsg = resultLines.join("\n");

  setGitHubOutput("result", resultMsg);

  const statusMsg = hasError ? "部分失败或出错" : "全部成功";
  const title = `iKuuu签到结果: ${statusMsg}`;
  await sendWechat(title, resultMsg);

  if (hasError) {
    process.exit(1);
  }
}

main();
