require("dotenv").config();
const express=require("express"),cors=require("cors"),bcrypt=require("bcryptjs"),jwt=require("jsonwebtoken"),fs=require("fs"),path=require("path");
const {Pool}=require("pg");
const app=express(),PORT=process.env.PORT||3000;
if(!process.env.DATABASE_URL) console.warn("DATABASE_URL is not set.");
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==="production"?{rejectUnauthorized:false}:false});
app.use(cors({origin:process.env.CORS_ORIGIN||"*"}));
app.use(express.json({limit:"4mb"}));
app.use(express.static(path.join(__dirname,"public")));

const schema=fs.readFileSync(path.join(__dirname,"db/schema.sql"),"utf8");
const slug=s=>String(s||"").trim().toLowerCase().replace(/[^\w\u0600-\u06FF]+/g,"-").replace(/^-|-$/g,"")+"-"+Date.now();

function token(u){return jwt.sign({id:u.id,role:u.role},process.env.JWT_SECRET||"CHANGE_ME",{expiresIn:"30d"})}
function auth(req,res,next){try{const t=(req.headers.authorization||"").replace("Bearer ","");req.user=jwt.verify(t,process.env.JWT_SECRET||"CHANGE_ME");next()}catch(e){res.status(401).json({error:"Unauthorized"})}}
function admin(req,res,next){if(req.user.role!=="admin")return res.status(403).json({error:"Admin only"});next()}
async function q(sql,args=[]){return pool.query(sql,args)}

app.get("/",(req,res)=>res.redirect("/admin"));
app.get("/api/health",async(req,res)=>{try{await q("SELECT 1");res.json({ok:true,database:true})}catch(e){res.status(503).json({ok:false,database:false})}});

app.post("/api/auth/register",async(req,res)=>{try{
 const {name,phone,password}=req.body||{}; if(!name||!phone||!password)return res.status(400).json({error:"نام، موبایل و رمز الزامی است"});
 const exists=await q("SELECT id FROM users WHERE phone=$1",[phone]); if(exists.rowCount)return res.status(409).json({error:"شماره قبلاً ثبت شده است"});
 const u={name,phone,password_hash:await bcrypt.hash(password,12),role:"customer"};
 const r=await q("INSERT INTO users(name,phone,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,phone,role",[u.name,u.phone,u.password_hash,u.role]);
 res.status(201).json({user:r.rows[0],token:token(r.rows[0])});
}catch(e){console.error(e);res.status(500).json({error:"Server error"})}});

app.post("/api/auth/login",async(req,res)=>{try{
 const {phone,password}=req.body||{},r=await q("SELECT * FROM users WHERE phone=$1 AND active=true",[phone]);
 if(!r.rowCount||!await bcrypt.compare(password,r.rows[0].password_hash||""))return res.status(401).json({error:"اطلاعات ورود اشتباه است"});
 const u=r.rows[0];res.json({user:{id:u.id,name:u.name,phone:u.phone,role:u.role},token:token(u)});
}catch(e){res.status(500).json({error:"Server error"})}});

app.get("/api/me",auth,async(req,res)=>{const r=await q("SELECT id,name,phone,role,active,created_at FROM users WHERE id=$1",[req.user.id]);if(!r.rowCount)return res.status(404).json({error:"Not found"});res.json(r.rows[0])});

app.get("/api/categories",async(req,res)=>res.json((await q("SELECT * FROM categories WHERE active=true ORDER BY sort_order,name")).rows));
app.get("/api/products",async(req,res)=>{const {category,search,featured}=req.query,a=[];let w=["p.active=true"];if(category){a.push(category);w.push(`c.slug=$${a.length}`)}if(search){a.push(`%${search}%`);w.push(`p.name ILIKE $${a.length}`)}if(featured==="true")w.push("p.featured=true");res.json((await q(`SELECT p.*,c.name category_name,c.slug category_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${w.join(" AND ")} ORDER BY p.featured DESC,p.created_at DESC`,a)).rows)});
app.get("/api/products/:id",async(req,res)=>{const r=await q("SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.id=$1 AND p.active=true",[req.params.id]);if(!r.rowCount)return res.status(404).json({error:"Not found"});res.json(r.rows[0])});
app.get("/api/daily-prices",async(req,res)=>res.json((await q(`SELECT d.*,p.name product_name FROM daily_prices d JOIN products p ON p.id=d.product_id WHERE d.price_date=(SELECT MAX(price_date) FROM daily_prices) ORDER BY p.name`)).rows));
app.get("/api/festivals",async(req,res)=>res.json((await q("SELECT * FROM festivals WHERE active=true AND (start_at IS NULL OR start_at<=NOW()) AND (end_at IS NULL OR end_at>=NOW()) ORDER BY created_at DESC")).rows));

app.get("/api/cart",auth,async(req,res)=>{let c=await q("SELECT id FROM carts WHERE user_id=$1",[req.user.id]);if(!c.rowCount)c=await q("INSERT INTO carts(user_id) VALUES($1) RETURNING id",[req.user.id]);const r=await q("SELECT ci.product_id,ci.quantity,p.name,p.price,p.image_url FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=$1",[c.rows[0].id]);res.json({cart_id:c.rows[0].id,items:r.rows})});
app.post("/api/cart",auth,async(req,res)=>{const {productId,quantity}=req.body||{};if(!productId||!quantity||quantity<=0)return res.status(400).json({error:"invalid"});let c=await q("SELECT id FROM carts WHERE user_id=$1",[req.user.id]);if(!c.rowCount)c=await q("INSERT INTO carts(user_id) VALUES($1) RETURNING id",[req.user.id]);await q("INSERT INTO cart_items(cart_id,product_id,quantity) VALUES($1,$2,$3) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=EXCLUDED.quantity",[c.rows[0].id,productId,quantity]);res.json({ok:true})});

app.get("/api/orders",auth,async(req,res)=>res.json((await q("SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC",[req.user.id])).rows));
app.post("/api/orders",auth,async(req,res)=>{const client=await pool.connect();try{await client.query("BEGIN");let c=await client.query("SELECT id FROM carts WHERE user_id=$1",[req.user.id]);if(!c.rowCount)throw Error("EMPTY");let items=await client.query("SELECT ci.product_id,ci.quantity,p.name,p.price,p.stock FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=$1 AND p.active=true",[c.rows[0].id]);if(!items.rowCount)throw Error("EMPTY");let total=0;for(const x of items.rows){if(Number(x.quantity)>Number(x.stock))throw Error("STOCK");total+=Number(x.price)*Number(x.quantity)}const o=await client.query("INSERT INTO orders(user_id,subtotal,total) VALUES($1,$2,$2) RETURNING *",[req.user.id,total]);for(const x of items.rows){await client.query("INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity,line_total) VALUES($1,$2,$3,$4,$5,$6)",[o.rows[0].id,x.product_id,x.name,x.price,x.quantity,Number(x.price)*Number(x.quantity)]);await client.query("UPDATE products SET stock=stock-$1,updated_at=NOW() WHERE id=$2",[x.quantity,x.product_id])}await client.query("DELETE FROM cart_items WHERE cart_id=$1",[c.rows[0].id]);await client.query("COMMIT");res.status(201).json(o.rows[0])}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message==="STOCK"?"موجودی کافی نیست":"سبد خرید خالی است"})}finally{client.release()}});

app.get("/api/admin/dashboard",auth,admin,async(req,res)=>{const r=await q("SELECT (SELECT COUNT(*) FROM products) products,(SELECT COUNT(*) FROM users WHERE role='customer') customers,(SELECT COUNT(*) FROM orders) orders,(SELECT COUNT(*) FROM festivals WHERE active=true) festivals");res.json(r.rows[0])});

app.get("/api/admin/products",auth,admin,async(req,res)=>res.json((await q("SELECT p.*,c.name category_name FROM products p LEFT JOIN categories c ON c.id=p.category_id ORDER BY p.created_at DESC")).rows));
app.post("/api/admin/products",auth,admin,async(req,res)=>{const x=req.body||{};if(!x.name)return res.status(400).json({error:"نام محصول الزامی است"});const r=await q(`INSERT INTO products(category_id,name,slug,description,image_url,price,compare_price,unit,stock,active,featured) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,[x.categoryId||null,x.name,slug(x.name),x.description||null,x.imageUrl||null,Number(x.price)||0,x.comparePrice?Number(x.comparePrice):null,x.unit||"عدد",Number(x.stock)||0,x.active!==false,x.featured===true]);res.status(201).json(r.rows[0])});
app.put("/api/admin/products/:id",auth,admin,async(req,res)=>{const x=req.body||{},r=await q(`UPDATE products SET category_id=$1,name=$2,description=$3,image_url=$4,price=$5,compare_price=$6,unit=$7,stock=$8,active=$9,featured=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,[x.categoryId||null,x.name,x.description||null,x.imageUrl||null,Number(x.price)||0,x.comparePrice?Number(x.comparePrice):null,x.unit||"عدد",Number(x.stock)||0,x.active!==false,x.featured===true,req.params.id]);if(!r.rowCount)return res.status(404).json({error:"Not found"});res.json(r.rows[0])});
app.delete("/api/admin/products/:id",auth,admin,async(req,res)=>{await q("UPDATE products SET active=false,updated_at=NOW() WHERE id=$1",[req.params.id]);res.json({ok:true})});

app.get("/api/admin/categories",auth,admin,async(req,res)=>res.json((await q("SELECT * FROM categories ORDER BY sort_order,name")).rows));
app.post("/api/admin/categories",auth,admin,async(req,res)=>{const x=req.body||{};const r=await q("INSERT INTO categories(name,slug,image_url,active,sort_order) VALUES($1,$2,$3,$4,$5) RETURNING *",[x.name,slug(x.name),x.imageUrl||null,x.active!==false,Number(x.sortOrder)||0]);res.status(201).json(r.rows[0])});
app.put("/api/admin/categories/:id",auth,admin,async(req,res)=>{const x=req.body||{},r=await q("UPDATE categories SET name=$1,image_url=$2,active=$3,sort_order=$4 WHERE id=$5 RETURNING *",[x.name,x.imageUrl||null,x.active!==false,Number(x.sortOrder)||0,req.params.id]);res.json(r.rows[0])});
app.delete("/api/admin/categories/:id",auth,admin,async(req,res)=>{await q("UPDATE categories SET active=false WHERE id=$1",[req.params.id]);res.json({ok:true})});

app.get("/api/admin/prices",auth,admin,async(req,res)=>res.json((await q("SELECT d.*,p.name product_name FROM daily_prices d JOIN products p ON p.id=d.product_id ORDER BY d.price_date DESC,p.name")).rows));
app.post("/api/admin/prices",auth,admin,async(req,res)=>{const x=req.body||{},r=await q("INSERT INTO daily_prices(product_id,price,price_date,note) VALUES($1,$2,$3,$4) RETURNING *",[x.productId,Number(x.price),x.priceDate||null,x.note||null]);res.status(201).json(r.rows[0])});
app.delete("/api/admin/prices/:id",auth,admin,async(req,res)=>{await q("DELETE FROM daily_prices WHERE id=$1",[req.params.id]);res.json({ok:true})});

app.get("/api/admin/festivals",auth,admin,async(req,res)=>res.json((await q("SELECT * FROM festivals ORDER BY created_at DESC")).rows));
app.post("/api/admin/festivals",auth,admin,async(req,res)=>{const x=req.body||{},r=await q("INSERT INTO festivals(name,description,discount_percent,start_at,end_at,image_url,active) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[x.name,x.description||null,x.discount?Number(x.discount):null,x.startAt||null,x.endAt||null,x.imageUrl||null,x.active!==false]);res.status(201).json(r.rows[0])});
app.put("/api/admin/festivals/:id",auth,admin,async(req,res)=>{const x=req.body||{},r=await q("UPDATE festivals SET name=$1,description=$2,discount_percent=$3,start_at=$4,end_at=$5,image_url=$6,active=$7 WHERE id=$8 RETURNING *",[x.name,x.description||null,x.discount?Number(x.discount):null,x.startAt||null,x.endAt||null,x.imageUrl||null,x.active!==false,req.params.id]);res.json(r.rows[0])});
app.delete("/api/admin/festivals/:id",auth,admin,async(req,res)=>{await q("UPDATE festivals SET active=false WHERE id=$1",[req.params.id]);res.json({ok:true})});

app.get("/api/admin/orders",auth,admin,async(req,res)=>res.json((await q("SELECT o.*,u.name customer_name,u.phone FROM orders o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC")).rows));
app.put("/api/admin/orders/:id/status",auth,admin,async(req,res)=>res.json((await q("UPDATE orders SET status=$1 WHERE id=$2 RETURNING *",[req.body.status,req.params.id])).rows[0]));
app.get("/api/admin/customers",auth,admin,async(req,res)=>res.json((await q("SELECT id,name,phone,active,created_at FROM users WHERE role='customer' ORDER BY created_at DESC")).rows));

async function boot(){
 await pool.query(schema);
 const adminUser=process.env.ADMIN_USER,adminPass=process.env.ADMIN_PASSWORD;
 if(adminUser&&adminPass){
  const e=await q("SELECT id FROM users WHERE phone=$1",[adminUser]);
  if(!e.rowCount)await q("INSERT INTO users(name,phone,password_hash,role) VALUES($1,$2,$3,'admin')",["مدیر واروک",adminUser,await bcrypt.hash(adminPass,12)]);
 }
 app.listen(PORT,()=>console.log("Varouk platform running on "+PORT));
}
boot().catch(e=>{console.error(e);process.exit(1)});
