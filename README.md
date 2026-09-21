# Personal-Deadline-Calendar

All by ChatGPT

An invitation code is necessary to create an account and enable cloud storage of personal data.

If U need it, U can contact me.

## 日子 · 使用与部署

静态页面部署在 GitHub Pages，登录及数据存储使用 Supabase。

- `index.html`：日历、邀请注册、账号登录、数据同步。
- `supabase/migrations/20260921_personal_deadline.sql`：独立数据表、邀请码哈希、RLS 和版本冲突检测。
- `supabase/functions/personal-deadline-register/index.ts`：服务端注册与邀请码核验。
- `supabase/functions/personal-deadline-admin/index.ts`：管理员查看成员、移除成员和生成一次性邀请码。
- `supabase/migrations/20260921_personal_deadline_admin.sql`：用户名、管理员身份和专属邀请规则。

公网仓库会公开网页代码。邀请码限制日历账号的加入，RLS 限制个人数据访问；GitHub Pages 的网页本身仍对公众可见。邀请码明文只交给仓库所有者，不写入仓库或前端。

同一账号跨设备同步。遇到同时编辑的版本冲突时，页面会要求选择读取云端或覆盖云端，以避免静默覆盖。原有完整迁移密钥仍可备份数据。

管理员账号 `Flying_Craft` 必须使用单独的一次性管理员邀请码注册。普通邀请码不能赋予管理员权限。管理员生成的邀请码一次使用后失效；明文只在生成时显示。移除成员会级联删除其个人日历，保留共享 Supabase 项目的其他应用账号。
