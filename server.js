require('dotenv').config();
process.env.TZ=process.env.TZ||'Asia/Shanghai';
const express=require('express'),helmet=require('helmet'),rateLimit=require('express-rate-limit'),Database=require('better-sqlite3'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const app=express(),PORT=Number(process.env.PORT||3000),dir=path.join(__dirname,'data');fs.mkdirSync(dir,{recursive:true});
const db=new Database(path.join(dir,'bookings.sqlite'));db.pragma('journal_mode=WAL');
db.exec(`CREATE TABLE IF NOT EXISTS bookings(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,contact TEXT NOT NULL,topic TEXT NOT NULL,question TEXT DEFAULT '',date TEXT NOT NULL,time TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','confirmed','cancelled')),created_at TEXT NOT NULL DEFAULT(datetime('now','localtime')),updated_at TEXT NOT NULL DEFAULT(datetime('now','localtime'))); CREATE UNIQUE INDEX IF NOT EXISTS unique_live_slot ON bookings(date,time) WHERE status!='cancelled';`);
app.use(helmet({contentSecurityPolicy:false}));
const allowedOrigins=(process.env.FRONTEND_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
app.use((req,res,next)=>{const origin=req.headers.origin;if(origin&&allowedOrigins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');}if(req.method==='OPTIONS')return res.sendStatus(204);next();});
app.use(express.json({limit:'20kb'}));
app.get('/',(req,res)=>{
  res.sendFile(path.join(__dirname,'index.html'));
});
app.get('/index.html',(req,res)=>{
  res.sendFile(path.join(__dirname,'index.html'));
});
app.get('/admin.html',(req,res)=>{
  res.sendFile(path.join(__dirname,'admin.html'));
});
app.get('/config.js',(req,res)=>{
  res.sendFile(path.join(__dirname,'config.js'));
});
app.use('/assets',express.static(path.join(__dirname,'assets')));
const limit=rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}),sessions=new Map(),clients=new Set(),SLOTS=['20:00','21:00','22:00','23:00','00:00','01:00','02:00','03:00'];
const pad=n=>String(n).padStart(2,'0'),key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
function available(){let out=[],now=new Date();for(let i=1;i<=8;i++){let d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+i),date=key(d),taken=new Set(db.prepare("SELECT time FROM bookings WHERE date=? AND status!='cancelled'").all(date).map(x=>x.time));out.push({date,year:d.getFullYear(),month:d.getMonth()+1,day:d.getDate(),weekday:d.getDay(),slots:SLOTS.map(time=>({time,available:!taken.has(time)&&new Date(date+'T'+time+':00+08:00')>now}))});}return out;}
function emit(event,data){let s=`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;clients.forEach(c=>c.write(s));}
function admin(req,res,next){let t=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');let s=sessions.get(t);if(!s||s<Date.now()){sessions.delete(t);return res.status(401).json({error:'管理员登录已过期'});}next();}
app.get('/api/health',(q,s)=>s.json({ok:true}));app.get('/api/availability',(q,s)=>s.json({days:available(),timezone:'Asia/Shanghai'}));
app.get('/api/events',(req,res)=>{res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.flushHeaders();res.write('event: connected\ndata: {}\n\n');clients.add(res);let hb=setInterval(()=>res.write(': ping\n\n'),20000);req.on('close',()=>{clearInterval(hb);clients.delete(res);});});
app.post('/api/bookings',limit,(req,res)=>{let {name,contact,topic,question='',date,time}=req.body||{};if(typeof name!=='string'||!name.trim()||name.length>60)return res.status(400).json({error:'请填写有效称呼'});if(typeof contact!=='string'||contact.trim().length<5||contact.length>120)return res.status(400).json({error:'请填写有效联系方式'});if(!['关系解读','事业与选择','综合深度解读','暂未确定，想先聊聊'].includes(topic))return res.status(400).json({error:'咨询方向无效'});if(typeof question!=='string'||question.length>2000)return res.status(400).json({error:'问题不能超过2000字'});if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!SLOTS.includes(time)||!available().some(d=>d.date===date&&d.slots.some(x=>x.time===time&&x.available)))return res.status(400).json({error:'该时段不可预约，请重新选择'});try{let x=db.prepare('INSERT INTO bookings(name,contact,topic,question,date,time) VALUES(?,?,?,?,?,?)').run(name.trim(),contact.trim(),topic,question.trim(),date,time);let b=db.prepare('SELECT * FROM bookings WHERE id=?').get(x.lastInsertRowid);console.log('New booking',b.id,b.date,b.time);emit('booking-created',{id:b.id});emit('availability-changed',{days:available()});res.status(201).json({bookingId:b.id,message:'预约已保存'});}catch(e){if(String(e.code).includes('CONSTRAINT'))return res.status(409).json({error:'该时段刚被预约，请选择其他时间'});console.error(e);res.status(500).json({error:'服务器保存失败'});}});
app.post('/api/admin/login',limit,(req,res)=>{let {username,password}=req.body||{},u=process.env.ADMIN_USERNAME||'admin',p=process.env.ADMIN_PASSWORD;if(!p||p.length<16||p==='请替换为至少16位随机密码')return res.status(503).json({error:'请先在.env配置至少16位管理员密码'});let ok=String(username)===u&&crypto.timingSafeEqual(Buffer.from(String(password||'').padEnd(p.length,'\0').slice(0,p.length)),Buffer.from(p));if(!ok)return res.status(401).json({error:'账号或密码错误'});let token=crypto.randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*60*60*1000);res.json({token});});
app.get('/api/admin/bookings',admin,(q,s)=>s.json({bookings:db.prepare('SELECT * FROM bookings ORDER BY date DESC,time DESC,id DESC').all()}));
app.patch('/api/admin/bookings/:id',admin,(q,s)=>{let status=q.body?.status;if(!['pending','confirmed','cancelled'].includes(status))return s.status(400).json({error:'状态无效'});let r=db.prepare("UPDATE bookings SET status=?,updated_at=datetime('now','localtime') WHERE id=?").run(status,Number(q.params.id));if(!r.changes)return s.status(404).json({error:'预约不存在'});let b=db.prepare('SELECT id,date,time,status FROM bookings WHERE id=?').get(Number(q.params.id));emit('booking-updated',b);emit('availability-changed',{days:available()});s.json({booking:b});});
app.listen(PORT,'0.0.0.0',()=>console.log(`Booking server listening on ${PORT}`));
