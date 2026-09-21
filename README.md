# Personal-Deadline-Calendar

All by ChatGPT

An invitation code is necessary to create an account and enable cloud storage of personal data.

If you need it, you can contact me.


静态页面部署在 GitHub Pages，登录及数据存储使用 Supabase。

- `index.html`：日历、邀请注册、账号登录、数据同步。
- `supabase/migrations/20260921_personal_deadline.sql`：独立数据表、邀请码哈希、RLS 和版本冲突检测。
- `supabase/functions/personal-deadline-register/index.ts`：服务端注册与邀请码核验。

公网仓库会公开网页代码。邀请码限制日历账号的加入，RLS 限制个人数据访问；GitHub Pages 的网页本身仍对公众可见。邀请码明文只交给仓库所有者，不写入仓库或前端。

同一账号跨设备同步。遇到同时编辑的版本冲突时，页面会要求选择读取云端或覆盖云端，以避免静默覆盖。原有完整迁移密钥仍可备份数据。
