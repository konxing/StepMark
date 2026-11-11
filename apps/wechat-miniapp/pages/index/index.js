const TOKEN_KEY="stepmark_mobile_access";
const EXPIRES_KEY="stepmark_mobile_expires";
Page({
  data:{modules:[],dueReviews:[],status:"正在连接…",loading:false,authenticated:false,
    creating:false,title:"",action:"",cue:"",selectedHabitId:"",progress:null,
    reflectionEventId:"",recentEvents:[],correcting:false,
    auditEventId:"",auditRows:[],auditNextOffset:null,auditLoading:false,
    feelingOptions:["非常抗拒","需要逼自己","有一点纠结","比较自然","几乎不用思考"],
    feelIndex:-1,feedbackNote:"",aiConsent:false,recentReflections:[]},
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
      try {
        const due=await this.api("/api/v1/habits/due","GET");
        this.setData({dueReviews:(due.due||[]).slice(0,4)});
      } catch {this.setData({dueReviews:[]});}
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
    const kind=e.currentTarget.dataset.kind||"done";
    const date=new Date(),day=date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
    this.setData({creating:true});
    try{
      const saved=await this.api("/api/v1/observations","POST",{
        habitId,opportunityKey:"daily:"+day,
        eligible:kind!=="no_cue",completed:kind==="done",occurredAt:new Date().toISOString()
      });
      this.setData({status:kind==="done"?"执行已保存，欢迎补充感受（选填）。":
        kind==="missed"?"已记录：有机会但没有执行。":"已记录：今天未出现触发情境。",
        reflectionEventId:kind==="done"?saved.event.id:"",selectedHabitId:habitId,
        feelIndex:-1,feedbackNote:"",aiConsent:false});
      await this.loadHabits();await this.refreshProgress(habitId);await this.refreshEvents(habitId);
    }catch(e){this.setData({status:e.message||"记录失败"});}
    finally{this.setData({creating:false});}
  },
  async openProgress(e){
    const id=e.currentTarget.dataset.id;
    this.setData({selectedHabitId:id,reflectionEventId:"",feelIndex:-1,feedbackNote:"",aiConsent:false,
      auditEventId:"",auditRows:[],auditNextOffset:null});
    await this.refreshProgress(id);
    await this.refreshEvents(id);
  },
  async refreshEvents(id){
    try{
      const response=await this.api("/api/v1/observations?habitId="+encodeURIComponent(id),"GET");
      this.setData({recentEvents:(response.events||[]).slice(0,14)});
    }catch{this.setData({recentEvents:[]});}
  },
  auditStateLabel(eligible,completed){
    return !eligible?"没有触发机会":completed?"已执行":"有机会但未执行";
  },
  async loadAuditHistory(eventId,offset){
    if(this.data.auditLoading)return;
    this.setData({auditLoading:true});
    try{
      const response=await this.api("/api/v1/observations/"+encodeURIComponent(eventId)+
        "?offset="+offset,"GET");
      const newRows=(response.corrections||[]).map(row=>({
        ...row,beforeLabel:this.auditStateLabel(row.previousEligible,row.previousCompleted),
        afterLabel:this.auditStateLabel(row.updatedEligible,row.updatedCompleted),
        dateLabel:new Date(row.correctedAt).toLocaleString("zh-CN")
      }));
      this.setData({auditEventId:eventId,
        auditRows:offset===0?newRows:this.data.auditRows.concat(newRows),
        auditNextOffset:response.nextOffset});
    }catch(e){this.setData({status:"更正历史读取失败，请稍后重试。"});}
    finally{this.setData({auditLoading:false});}
  },
  async toggleAuditHistory(e){
    const id=e.currentTarget.dataset.id;
    if(!id||this.data.auditLoading)return;
    if(this.data.auditEventId===id){
      this.setData({auditEventId:"",auditRows:[],auditNextOffset:null});
    }else{await this.loadAuditHistory(id,0);}
  },
  async loadMoreAudit(){
    if(this.data.auditEventId && this.data.auditNextOffset!==null)
      await this.loadAuditHistory(this.data.auditEventId,this.data.auditNextOffset);
  },
  async correctOpportunity(e){
    if(this.data.correcting||this.data.creating)return;
    const event=this.data.recentEvents.find(x=>x.id===e.currentTarget.dataset.id);
    const kind=e.currentTarget.dataset.kind;
    const id=this.data.selectedHabitId;
    if(!event||!id)return;
    const eligible=kind!=="no_cue",completed=kind==="done";
    if(event.eligible===eligible&&event.completed===completed)return;
    this.setData({correcting:true});
    try{
      await this.api("/api/v1/observations/"+event.id,"PUT",{
        expectedRevision:event.revision,eligible,completed
      });
      await Promise.all([this.refreshEvents(id),this.loadHabits(),this.refreshProgress(id)]);
      this.setData({auditEventId:"",auditRows:[],auditNextOffset:null,
        status:"已更正，可在记录中查看修改历史。"});
    }catch(e){
      await this.refreshEvents(id);
      this.setData({status:"更正失败。若关联了感受记录，需先删除该感受；或检查记录是否已被其他设备修改。"});
    }finally{this.setData({correcting:false});}
  },
  async refreshProgress(id){
    try{
      const progress=await this.api("/api/v1/habits/"+id+"/progress","GET");
      this.setData({selectedHabitId:id,progress});
      try{
        const data=await this.api("/api/v1/habits/"+id+"/reflections","GET");
        this.setData({recentReflections:(data.reflections||[]).slice(0,5)});
      }catch{this.setData({recentReflections:[]});}
    }catch(e){this.setData({status:e.message||"读取进度失败"});}
  },
  chooseFeeling(e){this.setData({feelIndex:Number(e.detail.value)});},
  updateFeelingNote(e){this.setData({feedbackNote:e.detail.value});},
  setAiConsent(e){this.setData({aiConsent:e.detail.value});},
  async saveReflection(){
    if(this.data.creating)return;
    const id=this.data.selectedHabitId;
    const text=this.data.feedbackNote.trim();
    if(!id || (!text && this.data.feelIndex<0))return;
    const body={aiConsent:Boolean(this.data.aiConsent&&text)};
    if(text)body.note=text;
    if(this.data.feelIndex>=0)body.initiationLevel=this.data.feelIndex;
    if(this.data.reflectionEventId)body.eventId=this.data.reflectionEventId;
    this.setData({creating:true});
    try {
      const result=await this.api("/api/v1/habits/"+id+"/reflections","POST",body);
      this.setData({status:result.reflection.aiStatus==="PENDING"?
        "感受已保存。AI 将异步分析；无需重复提交。":"感受已保存，尚未向外部 AI 发送。",
        feedbackNote:"",feelIndex:-1,aiConsent:false,reflectionEventId:""});
      await this.refreshProgress(id);
    }catch(e){this.setData({status:e.message||"保存感受失败"});}
    finally{this.setData({creating:false});}
  },
  async controlReflection(e){
    if(this.data.creating)return;
    const habitId=this.data.selectedHabitId;
    const reflectionId=e.currentTarget.dataset.id;
    const action=e.currentTarget.dataset.action;
    if(!habitId||!reflectionId)return;
    if(action==="delete"){
      const confirmed=await new Promise(resolve=>wx.showModal({
        title:"删除感受记录",content:"从 StepMark 删除这条感受和本地分析。此前发送给第三方 AI 的文字无法收回。",
        success:res=>resolve(res.confirm),fail:()=>resolve(false)
      }));
      if(!confirmed)return;
    }
    this.setData({creating:true});
    try{
      const result=await this.api("/api/v1/habits/"+habitId+"/reflections/"+reflectionId,
        action==="delete"?"DELETE":"PUT");
      await this.refreshProgress(habitId);
      this.setData({status:result.mayHaveBeenSentToProvider?
        "已更新本地记录；此前已发送给服务商的文字不能撤回。":
        action==="delete"?"这条感受已从 StepMark 删除。":"已撤回后续 AI 分析授权。"});
    }catch(e){this.setData({status:e.message||"修改失败；如果 AI 正在处理，请稍后重试。"});}
    finally{this.setData({creating:false});}
  },
  async toggleReview(e){
    const habit=this.data.modules.find(h=>h.id===e.currentTarget.dataset.id);
    if(!habit)return;
    try{
      await this.api("/api/v1/habits/"+habit.id+"/reviews","PUT",{enabled:!habit.reviewEnabled});
      await this.loadHabits();await this.refreshProgress(habit.id);
      this.setData({status:habit.reviewEnabled?"复查提示已关闭":"复查提示已开启"});
    }catch(e){this.setData({status:e.message||"修改设置失败"});}
  },
  async logout(){
    try{await this.api("/api/v1/auth/wechat/logout","POST",{});}
    catch(e){/* Best effort: revoke server session when reachable. */}
    wx.removeStorageSync(TOKEN_KEY);wx.removeStorageSync(EXPIRES_KEY);
    this.setData({authenticated:false,modules:[],dueReviews:[],recentEvents:[],
      auditEventId:"",auditRows:[],auditNextOffset:null,status:"已退出登录"});
  }
});
