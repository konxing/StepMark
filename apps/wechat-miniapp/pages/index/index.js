const TOKEN_KEY="stepmark_mobile_access";
const EXPIRES_KEY="stepmark_mobile_expires";
Page({
  data:{modules:[],status:"正在连接…",loading:false,authenticated:false,
    creating:false,title:"",action:"",cue:""},
  onLoad(){this.bootstrap();},
  onShow(){if(this.data.authenticated)this.loadHabits();},
  api(path,method,data,authenticated=true){
    const base=getApp().globalData.apiBase;
    if(!/^https:\/\//.test(base)){
      return Promise.reject(new Error("请先配置已注册的 HTTPS API 域名"));
    }
    const token=wx.getStorageSync(TOKEN_KEY);
    return new Promise((resolve,reject)=>{
      wx.request({
        url:base+path,method,
        header:Object.assign({"content-type":"application/json"},authenticated?{"Authorization":"Bearer "+token}:{}),
        data,timeout:8000,
        success:res=> {
          if(res.statusCode>=200&&res.statusCode<300)resolve(res.data);
          else reject(new Error(res.statusCode===401?"登录信息已过期":"服务请求失败（"+res.statusCode+"）"));
        },
        fail:()=>reject(new Error("网络请求失败"))
      });
    });
  },
  async bootstrap(){
    if(this.data.loading)return;
    this.setData({loading:true,status:"正在安全登录…"});
    try{
      const expires=Number(wx.getStorageSync(EXPIRES_KEY)||0);
      const token=wx.getStorageSync(TOKEN_KEY);
      if(!token||expires<Date.now()+60*1000){
        wx.removeStorageSync(TOKEN_KEY);wx.removeStorageSync(EXPIRES_KEY);
        const login=await new Promise((resolve,reject)=>{
          wx.login({success:res=>res.code?resolve(res.code):reject(new Error("微信登录未返回凭证")),
            fail:()=>reject(new Error("无法调用微信登录"))});
        });
        const auth=await this.api("/api/v1/auth/wechat","POST",{code:login},false);
        if(!auth.accessToken||!auth.expiresAt)throw new Error("登录响应无效");
        wx.setStorageSync(TOKEN_KEY,auth.accessToken);
        wx.setStorageSync(EXPIRES_KEY,new Date(auth.expiresAt).getTime());
      }
      this.setData({authenticated:true,status:"已连接"});
      await this.loadHabits();
    }catch(e){this.setData({authenticated:false,status:e.message||"暂无法连接"});}
    finally{this.setData({loading:false});}
  },
  async loadHabits(){
    try{
      const response=await this.api("/api/v1/habits","GET");
      this.setData({modules:response.habits||[],status:"已连接"});
    }catch(e){
      if(String(e.message).includes("已过期")){
        wx.removeStorageSync(TOKEN_KEY);wx.removeStorageSync(EXPIRES_KEY);
        this.setData({authenticated:false,status:"登录已过期，正在更新…"});
        this.bootstrap();
      }else this.setData({status:e.message||"读取失败"});
    }
  },
  updateTitle(e){this.setData({title:e.detail.value});},
  updateAction(e){this.setData({action:e.detail.value});},
  updateCue(e){this.setData({cue:e.detail.value});},
  async createHabit(){
    if(this.data.creating||!this.data.title.trim()||!this.data.action.trim())return;
    this.setData({creating:true});
    try{
      await this.api("/api/v1/habits","POST",{title:this.data.title,action:this.data.action,
        cue:this.data.cue||undefined});
      this.setData({title:"",action:"",cue:"",status:"习惯已创建"});
      await this.loadHabits();
    }catch(e){this.setData({status:e.message||"创建失败"});}
    finally{this.setData({creating:false});}
  },
  async record(e){
    if(this.data.creating)return;
    const habitId=e.currentTarget.dataset.id;
    const date=new Date(), day=date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
    this.setData({creating:true});
    try{
      await this.api("/api/v1/observations","POST",{
        habitId,opportunityKey:"daily:"+day,
        eligible:true,completed:true,occurredAt:new Date().toISOString()
      });
      this.setData({status:"已记录一次行为（并非能力加分）"});
      await this.loadHabits();
    }catch(e){this.setData({status:e.message||"记录失败"});}
    finally{this.setData({creating:false});}
  },
  async logout(){
    try{await this.api("/api/v1/auth/wechat/logout","POST",{});}
    catch(e){/* Best effort: revoke server session when reachable. */}
    wx.removeStorageSync(TOKEN_KEY);wx.removeStorageSync(EXPIRES_KEY);
    this.setData({authenticated:false,modules:[],status:"已退出登录"});
  }
});
