const TOKEN_KEY="stepmark_mobile_access";
const EXPIRES_KEY="stepmark_mobile_expires";
Page({
  data:{modules:[],dueReviews:[],status:"正在连接…",loading:false,authenticated:false,
    chatMessages:[{id:"chat-welcome",role:"assistant",text:"告诉我你想培养的习惯、今天有没有完成，以及开始行动时的感受。我会在明确且安全的情况下帮你记录。"}],
    chatInput:"",chatBusy:false,chatConsent:false,chatStatus:"",
    chatBottomId:"chat-welcome",chatRetryId:"",chatRetryMessage:"",
    showAdvanced:false,
    chatSuggestions:["帮我添加一个睡前阅读10页的习惯","我今天完成了睡前阅读","查看睡前阅读的习惯进度"],
    creating:false,title:"",action:"",cue:"",selectedHabitId:"",progress:null,
    reflectionEventId:"",recentEvents:[],correcting:false,
    auditEventId:"",auditRows:[],auditNextOffset:null,auditLoading:false,
    practiceOpen:false,practiceBusy:false,practiceItem:null,practiceDomains:[],
    practiceSkill:"conditional",practiceSelected:"",practiceFeedback:null,
    practiceHintUsed:false,practiceNextReviewUtc:"",
    practiceRecommended:"",practiceStatus:"",
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
        data,timeout:path==="/api/v1/assistant"?17000:8000,
        success:res=> {
          if(res.statusCode>=200&&res.statusCode<300)resolve(res.data);
          else {
            const code=res.data&&res.data.error&&res.data.error.code;
            const error=new Error(res.statusCode===401?"登录信息已过期":
              code==="ASSISTANT_NOT_CONFIGURED"?"服务器暂未配置对话 AI，可先使用手动管理。":
              code==="RATE_LIMITED"?"AI 对话次数达到上限，请稍后使用。":
              "服务请求失败（"+res.statusCode+"）");
            error.code=code;reject(error);
          }
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
  toggleAdvanced(){this.setData({showAdvanced:!this.data.showAdvanced});},
  onChatInput(e){this.setData({chatInput:e.detail.value});},
  onChatConsent(e){this.setData({chatConsent:Boolean(e.detail.value),chatStatus:""});},
  chooseChatSuggestion(e){this.setData({chatInput:e.currentTarget.dataset.text||"",chatStatus:""});},
  appendChat(role,text){
    const id="chat-"+Date.now()+"-"+Math.floor(Math.random()*1000000);
    this.setData({chatMessages:this.data.chatMessages.concat([{id,role,text}]).slice(-14),
      chatBottomId:id});
  },
  newRequestId(){
    // This is an idempotency identifier, never an authentication credential.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g,c=>{
      const v=Math.floor(Math.random()*16);return (c==="x"?v:((v&3)|8)).toString(16);
    });
  },
  localCalendarDay(){
    const d=new Date();
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),
      String(d.getDate()).padStart(2,"0")].join("-");
  },
  async sendChat(){
    const message=this.data.chatInput.trim();
    if(this.data.chatBusy||message.length<2)return;
    if(!this.data.chatConsent){
      this.setData({chatStatus:"请先选择是否同意将当前消息与习惯名称发送给配置的第三方 AI。"});
      return;
    }
    const retry=this.data.chatRetryMessage===message&&this.data.chatRetryId;
    const requestId=retry?this.data.chatRetryId:this.newRequestId();
    this.setData({chatBusy:true,chatStatus:"正在理解并检查记录…",chatInput:"",
      chatRetryId:requestId,chatRetryMessage:message});
    if(!retry)this.appendChat("user",message);
    try{
      const result=await this.api("/api/v1/assistant","POST",{
        message,requestId,localDate:this.localCalendarDay(),consentToAI:true
      });
      if(typeof result.reply!=="string")throw new Error("AI 响应不完整");
      this.appendChat("assistant",result.reply);
      this.setData({chatStatus:"",chatRetryId:"",chatRetryMessage:""});
      const habitId=result.change&&result.change.habitId||
        (result.progress&&result.progress.habitId);
      if(result.change)await this.loadHabits();
      if(habitId){
        this.setData({selectedHabitId:habitId,reflectionEventId:""});
        await this.refreshProgress(habitId);
        await this.refreshEvents(habitId);
      }
    }catch(e){
      this.setData({chatInput:message,chatStatus:e.message||
        "无法确认是否已保存，请先核查习惯记录，再决定是否重试。"});
    }finally{this.setData({chatBusy:false});}
  },
  async openPractice(){
    if(this.data.practiceOpen){
      this.setData({practiceOpen:false});return;
    }
    this.setData({practiceOpen:true});
    await this.loadPractice("");
  },
  async loadPractice(skill){
    if(this.data.practiceBusy)return;
    this.setData({practiceBusy:true,practiceStatus:"正在加载训练题…"});
    try{
      const query=skill?"?skill="+encodeURIComponent(skill):"";
      const result=await this.api("/api/v1/practice"+query,"GET");
      this.setData({practiceDomains:result.skills||[],practiceSkill:result.skill,
        practiceItem:result.item,practiceRecommended:result.recommendedSkill||"",
        practiceSelected:"",practiceFeedback:null,practiceHintUsed:false,
        practiceNextReviewUtc:result.nextReviewUtc||"",
        practiceStatus:result.item?"按自己的判断选择答案，提交后查看解析。":
          "这个类别今天已练完，可换一个题型或明天再来。"});
    }catch(e){this.setData({practiceStatus:e.message||"训练题加载失败"});}
    finally{this.setData({practiceBusy:false});}
  },
  async changePracticeSkill(e){
    const skill=e.currentTarget.dataset.skill;
    if(skill && !this.data.practiceBusy)await this.loadPractice(skill);
  },
  choosePracticeAnswer(e){this.setData({practiceSelected:e.detail.value});},
  showPracticeHint(){this.setData({practiceHintUsed:true});},
  async submitPractice(){
    if(this.data.practiceBusy||this.data.practiceFeedback||!this.data.practiceSelected||
      !this.data.practiceItem)return;
    this.setData({practiceBusy:true});
    try{
      const result=await this.api("/api/v1/practice","POST",{
        itemId:this.data.practiceItem.id,selectedKey:this.data.practiceSelected,
        hintUsed:this.data.practiceHintUsed
      });
      this.setData({practiceFeedback:result,practiceStatus:"练习记录已保存，不影响正式测验分数。"});
    }catch(e){this.setData({practiceStatus:e.message||"提交失败，请刷新练习状态"});}
    finally{this.setData({practiceBusy:false});}
  },
  async nextPractice(){await this.loadPractice(this.data.practiceSkill);},
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
        const labels={DISABLED:"未启用",PENDING:"待分析",PROCESSING:"分析中",
          COMPLETED:"已分析",FAILED:"分析失败"};
        this.setData({recentReflections:(data.reflections||[]).slice(0,5).map(x=>({
          ...x,aiStatusLabel:labels[x.aiStatus]||"未知"
        }))});
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
      chatInput:"",chatConsent:false,chatRetryId:"",chatRetryMessage:"",
      chatMessages:[{id:"chat-welcome",role:"assistant",text:"登录后，我可以帮你记录行动与感受。"}],
      chatBottomId:"chat-welcome",chatStatus:"",
      auditEventId:"",auditRows:[],auditNextOffset:null,practiceOpen:false,
      practiceItem:null,practiceFeedback:null,practiceSelected:"",practiceDomains:[],
      practiceHintUsed:false,practiceNextReviewUtc:"",
      status:"已退出登录"});
  }
});
