const DISCORD='https://discord.com/api/v10';
const ROLES={dev:'1524378458313064560',support:'1524378456589336756',admin:'1524378460364079227'};
const INVITE='https://discord.gg/7w5KupkWNY';
const now=()=>Date.now();
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
class HttpError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const fail=(message,status=400)=>{throw new HttpError(message,status)};
const db=(env)=>{if(!env.DB)fail('ฐานข้อมูลยังไม่พร้อม กรุณาลองใหม่ภายหลัง',503);return env.DB};
const query=(env,sql,...values)=>db(env).prepare(sql).bind(...values);
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const random=()=>crypto.randomUUID()+crypto.randomUUID();
function cookies(req){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(s=>s.trim().split(/=(.*)/s).slice(0,2)))}
const cookie=(name,value,age)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
async function discord(path,options={}){const res=await fetch(DISCORD+path,{...options,signal:AbortSignal.timeout(10000)});if(!res.ok)fail('ไม่สามารถตรวจสอบบัญชี Discord ได้ กรุณาลองใหม่',503);return res.json()}
async function identity(req,env){const token=cookies(req).ft_session;if(!token)return null;const session=await query(env,'SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?',await hash(token),now()).first();return session||null;}
async function staff(user,env){if(!user||!env.DISCORD_BOT_TOKEN||!env.DISCORD_GUILD_ID)return null;const res=await fetch(`${DISCORD}/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`,{headers:{Authorization:`Bot ${env.DISCORD_BOT_TOKEN}`},signal:AbortSignal.timeout(10000)});if(res.status===404)return null;if(!res.ok)fail('ตรวจสอบยศทีมงานไม่สำเร็จ กรุณาลองใหม่',503);const member=await res.json();const roles=member.roles||[];if(roles.includes(ROLES.dev))return 'dev';if(roles.includes(ROLES.admin))return 'admin';if(roles.includes(ROLES.support))return 'support';return null;}
function cents(value){const n=Number(value);if(!Number.isFinite(n)||n<=0||n>100000||Math.abs(n*100-Math.round(n*100))>0.000001)fail('จำนวนเงินไม่ถูกต้อง');return Math.round(n*100);}
function text(value,max=200){if(typeof value!=='string'||!value.trim()||value.length>max)fail('กรุณากรอกข้อมูลให้ครบและไม่เกินความยาวที่กำหนด');return value.trim();}
function origin(req,env){const actual=new URL(req.url).origin;const trusted=env.SITE_ORIGIN||actual;if(new URL(trusted).origin!==actual)fail('โดเมนไม่ตรงกับที่ตั้งค่า',400);return trusted;}
async function body(req){if(Number(req.headers.get('content-length')||0)>100000)fail('ข้อมูลมีขนาดใหญ่เกินไป',413);try{return await req.json()}catch{fail('ข้อมูลคำขอไม่ถูกต้อง')}}
async function route(req,env){
 const url=new URL(req.url), path=url.pathname;
 if(path.startsWith('/assets/')){const data=ASSETS[path];if(!data)return new Response('Not found',{status:404});const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));return new Response(bytes,{headers:{'Content-Type':'image/png','Cache-Control':'public,max-age=86400'}})}
 if(req.method==='GET'&&!path.startsWith('/api/')&&!path.startsWith('/auth/'))return new Response(PAGE,{headers:{'Content-Type':'text/html; charset=utf-8'}});
 if(req.method!=='GET'&&path!=='/api/topup/slip'&&Number(req.headers.get('content-length')||0)>100000)fail('ข้อมูลใหญ่เกินไป',413);
 if(!['GET','HEAD'].includes(req.method)&&req.headers.get('origin')!==origin(req,env))fail('คำขอนี้ไม่ได้มาจากเว็บ FAKE TOWN',403);
 if(path==='/auth/discord'){
  if(!env.DISCORD_CLIENT_ID||!env.DISCORD_CLIENT_SECRET)return Response.redirect(origin(req,env)+'/?notice=discord_setup',302);
  const state=random();const auth=new URL('https://discord.com/oauth2/authorize');auth.search=new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,response_type:'code',scope:'identify',redirect_uri:origin(req,env)+'/auth/discord/callback',state});
  return new Response(null,{status:302,headers:{Location:auth.toString(),'Set-Cookie':cookie('ft_oauth_state',state,600)}});
 }
 if(path==='/auth/discord/callback'){
  const state=cookies(req).ft_oauth_state;if(!state||url.searchParams.get('state')!==state)fail('การเข้าสู่ระบบหมดอายุ กรุณาลองใหม่',403);
  if(url.searchParams.get('error'))return new Response(null,{status:302,headers:{Location:origin(req,env)+'/?notice=login_cancelled','Set-Cookie':cookie('ft_oauth_state','',0)}});
  const code=text(url.searchParams.get('code'),2048);
  const token=await discord('/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:origin(req,env)+'/auth/discord/callback'})});
  const user=await discord('/users/@me',{headers:{Authorization:`Bearer ${token.access_token}`}});const session=random();
  await db(env).batch([query(env,'INSERT INTO users (id,name,avatar,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,avatar=excluded.avatar',user.id,user.global_name||user.username,user.avatar||null,now()),query(env,'INSERT INTO sessions (hash,user_id,expires) VALUES (?,?,?)',await hash(session),user.id,now()+7*86400000)]);
  const headers=new Headers({Location:origin(req,env)+'/account'});headers.append('Set-Cookie',cookie('ft_session',session,7*86400));headers.append('Set-Cookie',cookie('ft_oauth_state','',0));return new Response(null,{status:302,headers});
 }
 if(path==='/api/config')return json({invite:INVITE,discordReady:!!(env.DISCORD_CLIENT_SECRET&&env.DISCORD_CLIENT_ID),paymentReady:!!(env.EASYSLIP_API_KEY&&env.EASYSLIP_ACCOUNT_REGISTERED === '1'),bank:{name:'กสิกรไทย',account:'214-8-04701-7',owner:'สิปปกร ทวีเพชร'},roles:ROLES});
 if(path==='/api/products'&&req.method==='GET')return json({products:(await query(env,'SELECT id,name,category,description,price,image FROM products WHERE enabled=1 ORDER BY created_at DESC').all()).results});
 const user=await identity(req,env);
 if(path==='/api/me')return json({user,role:await staff(user,env),balance:user?(await query(env,'SELECT COALESCE(SUM(amount),0) AS balance FROM ledger WHERE user_id=?',user.id).first()).balance:0});
 if(path==='/api/logout'&&req.method==='POST'){if(cookies(req).ft_session)await query(env,'DELETE FROM sessions WHERE hash=?',await hash(cookies(req).ft_session)).run();return new Response('{}',{headers:{'Content-Type':'application/json','Set-Cookie':cookie('ft_session','',0)}})}
 if(!user)fail('กรุณาเข้าสู่ระบบด้วย Discord ก่อน',401);
 if(path==='/api/history')return json({orders:(await query(env,'SELECT id,name,amount,status,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id).all()).results,topups:(await query(env,'SELECT id,amount,status,created_at FROM topups WHERE user_id=? ORDER BY created_at DESC LIMIT 100',user.id).all()).results});
 if(path==='/api/buy'&&req.method==='POST'){
  const b=await body(req), id=text(b.id,100), key=text(b.key,100);if(!/^[a-zA-Z0-9-]{20,100}$/.test(key))fail('คำขอสั่งซื้อไม่ถูกต้อง');
  const existing=await query(env,'SELECT * FROM orders WHERE id=? AND user_id=?',key,user.id).first();if(existing)return json({order:existing});
  const product=await query(env,'SELECT * FROM products WHERE id=? AND enabled=1',id).first();if(!product)fail('ไม่พบสินค้าหรือสินค้านี้ยังไม่เปิดขาย',404);
  // Debit and order creation share one atomic D1 batch; the debit checks the current balance.
  await db(env).batch([query(env,'INSERT INTO ledger (id,user_id,amount,reference,kind,created_at) SELECT ?,?,-?,?,?,? WHERE (SELECT COALESCE(SUM(amount),0) FROM ledger WHERE user_id=?) >= ?',key,user.id,product.price,'order:'+key,'purchase',now(),user.id,product.price),query(env,'INSERT INTO orders (id,user_id,product_id,name,amount,status,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM ledger WHERE id=? AND user_id=?)',key,user.id,id,product.name,product.price,'pending',now(),key,user.id)]);
  const order=await query(env,'SELECT * FROM orders WHERE id=? AND user_id=?',key,user.id).first();if(!order)fail('เครดิตไม่เพียงพอ กรุณาเติมเงินก่อน');return json({order});
 }
 if(path==='/api/topup/slip'&&req.method==='POST'){
  if(!env.EASYSLIP_API_KEY||env.EASYSLIP_ACCOUNT_REGISTERED !== '1')fail('ยังไม่เปิดรับชำระเงิน บริการตรวจสลิปยังไม่ได้เชื่อมต่อ',503);
  if(Number(req.headers.get('content-length')||0)>4500000)fail('สลิปต้องไม่เกิน 4 MB',413);
  const recent=await query(env,'SELECT created_at FROM topups WHERE user_id=? ORDER BY created_at DESC LIMIT 1',user.id).first();if(recent&&now()-recent.created_at<15000)fail('กรุณารอ 15 วินาทีก่อนส่งสลิปอีกครั้ง',429);
  const form=await req.formData(), amount=cents(form.get('amount')), file=form.get('image');if(!file||!file.arrayBuffer||file.size>4194304||!['image/png','image/jpeg','image/webp'].includes(file.type))fail('กรุณาส่งรูปสลิป PNG, JPG หรือ WebP ขนาดไม่เกิน 4 MB');
  const id=crypto.randomUUID();await query(env,'INSERT INTO topups (id,user_id,amount,status,created_at) VALUES (?,?,?,?,?)',id,user.id,amount,'verifying',now()).run();
  try{
   const upload=new FormData();upload.append('image',file);upload.append('matchAccount','true');upload.append('matchAmount',String(amount/100));upload.append('checkDuplicate','true');upload.append('remark',id);
   const response=await fetch('https://api.easyslip.com/v2/verify/bank',{method:'POST',headers:{Authorization:`Bearer ${env.EASYSLIP_API_KEY}`},body:upload,signal:AbortSignal.timeout(25000)});const result=await response.json();const s=result.data;
   if(!response.ok||!result.success||!s)fail('ตรวจสลิปไม่สำเร็จ กรุณาตรวจสอบสลิปและลองใหม่');
   if(s.isDuplicate||!s.matchedAccount||String(s.matchedAccount.bankNumber||'').replace(/\D/g,'')!=='2148047017'||s.matchedAccount.bank?.code!=='004'||s.isAmountMatched!==true||cents(s.amountInSlip)!==amount)fail('สลิปซ้ำ ยอดเงินไม่ตรง หรือบัญชีผู้รับไม่ตรง กรุณาตรวจสอบ');
   const reference=text(s.rawSlip?.transRef,150);const date=Date.parse(s.rawSlip?.date);if(!Number.isFinite(date)||now()-date>86400000||date-now()>300000)fail('กรุณาใช้สลิปโอนภายใน 24 ชั่วโมง');
   await db(env).batch([query(env,'INSERT INTO ledger (id,user_id,amount,reference,kind,created_at) VALUES (?,?,?,?,?,?)',id,user.id,amount,'bank:'+reference,'topup',now()),query(env,'UPDATE topups SET status=?,reference=? WHERE id=?','verified',reference,id)]);return json({message:'ตรวจสอบสำเร็จ เติมเครดิตเข้าบัญชีแล้ว'});
  }catch(error){await query(env,'UPDATE topups SET status=? WHERE id=?','failed',id).run();if(error instanceof HttpError)throw error;fail('ตรวจสอบไม่สำเร็จหรือสลิปเคยใช้แล้ว กรุณาติดต่อทีมงาน',503);}
 }
 if(path.startsWith('/api/admin/')){
  const role=await staff(user,env);if(!role)fail('คุณไม่มียศทีมงานที่ได้รับอนุญาต',403);
  if(path==='/api/admin/overview'&&req.method==='GET')return json({role,products:(await query(env,'SELECT * FROM products ORDER BY created_at DESC').all()).results,orders:(await query(env,'SELECT orders.*,users.name AS customer FROM orders JOIN users ON users.id=orders.user_id ORDER BY orders.created_at DESC LIMIT 100').all()).results,topups:(await query(env,'SELECT topups.*,users.name AS customer FROM topups JOIN users ON users.id=topups.user_id ORDER BY topups.created_at DESC LIMIT 100').all()).results});
  if(role==='support')fail('ยศ SUPPORT ดูข้อมูลได้ แต่แก้สินค้าและสถานะคำสั่งซื้อไม่ได้',403);
  if(path==='/api/admin/products'&&req.method==='POST'){
   const b=await body(req),id=b.id?text(b.id,100):crypto.randomUUID(),category=text(b.category,30);if(!['vip','item','skin','car','package'].includes(category))fail('หมวดสินค้าไม่ถูกต้อง');const price=cents(b.price);const image=b.image?text(b.image,1000):null;if(image&&!image.startsWith('https://'))fail('รูปสินค้าต้องเป็นลิงก์ HTTPS');
   await query(env,'INSERT INTO products (id,name,category,description,price,image,enabled,created_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,price=excluded.price,image=excluded.image,enabled=excluded.enabled',id,text(b.name,100),category,text(b.description,2000),price,image,b.enabled===true?1:0,now()).run();return json({id});
  }
  if(path==='/api/admin/orders'&&req.method==='POST'){const b=await body(req);if(b.status!=='delivered')fail('สถานะไม่ถูกต้อง');const result=await query(env,'UPDATE orders SET status=? WHERE id=? AND status=?','delivered',text(b.id,100),'pending').run();if(!result.meta.changes)fail('ไม่พบรายการที่รอส่ง',404);return json({message:'บันทึกการส่งสินค้าแล้ว'});}
 }
 fail('ไม่พบหน้าที่ต้องการ',404);
}
export default {async fetch(req,env){try{const response=await route(req,env);const headers=new Headers(response.headers);headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','same-origin');headers.set('X-Frame-Options','SAMEORIGIN');headers.set('Content-Security-Policy',"default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");return new Response(response.body,{status:response.status,headers});}catch(error){if(!(error instanceof HttpError))console.error('FAKE TOWN request failed:',error.message);return json({error:error instanceof HttpError?error.message:'ระบบขัดข้องชั่วคราว กรุณาลองใหม่'},error.status||500)}}};
export { cents, ROLES };
