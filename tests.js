// Tests des calculs EducAct. Lancer : node tests.js
const fs=require('fs'),vm=require('vm');
const html=fs.readFileSync(__dirname+'/index.html','utf8');
const js=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].pop()[1];
function grab(name){
  const i=js.indexOf('function '+name+'(');if(i<0)throw new Error('introuvable: '+name);
  let d=0,k=js.indexOf('{',i);for(let j=k;j<js.length;j++){if(js[j]==='{')d++;else if(js[j]==='}'){d--;if(!d)return js.slice(i,j+1)}}
}
const src=['r2','tcls','gcl','getMats','curMat','calc','qa','stats'].map(grab).join('\n');
const ctx={S:null,cur:{gc:'',gm:'',gp:'1'}};vm.createContext(ctx);vm.runInContext(src,ctx);
let ok=0,ko=0;
function eq(a,b,m){if(JSON.stringify(a)===JSON.stringify(b)){ok++}else{ko++;console.log('ÉCHEC',m,'obtenu',JSON.stringify(a),'attendu',JSON.stringify(b))}}
function base(){return{classes:[{id:'c1',name:'6e',t:1,students:[{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}]}],
 mats:{c1:[{id:'m1',n:'Maths',coef:3}]},zabs:false,att:{},inc:[],
 eva:[{id:'e1',cid:'c1',mid:'m1',per:'1',t:'I',m:20},{id:'e2',cid:'c1',mid:'m1',per:'1',t:'I',m:10},{id:'e3',cid:'c1',mid:'m1',per:'1',t:'D',m:20},{id:'e4',cid:'c1',mid:'m1',per:'1',t:'D',m:20},{id:'e5',cid:'c1',mid:'m1',per:'1',t:'D',m:20}],
 notes:{e1:{a:10,b:16,c:12},e2:{a:5,b:8,c:6},e3:{a:12,b:14},e4:{a:8,b:18}}}}
ctx.S=base();ctx.cur.gc='c1';
let r=ctx.calc(ctx.S.classes[0],'1');
eq(r.k,3,'coefficient');
// A : moy interro = (10 + 10)/2 = 10 ; devoirs 12 et 8 ; moyenne = (10+12+8)/3 = 10
eq(ctx.r2(r.rows[0].mi),10,'moyenne interros A');
eq(ctx.r2(r.rows[0].m),10,'moyenne semestre A');
// B : interros (16+16)/2=16 ; devoirs 14,18 ; (16+14+18)/3 = 16
eq(ctx.r2(r.rows[1].m),16,'moyenne semestre B');
// C : interros (12+12)/2=12 ; devoir 1 = null, devoir 2 = null -> moyenne = 12
eq(ctx.r2(r.rows[2].m),12,'moyenne C avec devoirs manquants');
eq(ctx.r2(r.rows[1].mc),48,'moyenne x coefficient');
eq(r.rows.map(x=>x.r),[3,1,2],'rangs');
eq(r.D.length,2,'seulement 2 devoirs comptés');
// Ex æquo
ctx.S.notes.e1.a=16;ctx.S.notes.e2.a=8;ctx.S.notes.e3.a=14;ctx.S.notes.e4.a=18;
r=ctx.calc(ctx.S.classes[0],'1');eq(r.rows[0].r,r.rows[1].r,'ex æquo : même rang');
// Absent à une évaluation, zéro d'absence actif
ctx.S=base();ctx.S.zabs=true;ctx.S.notes.e1.a='A';
r=ctx.calc(ctx.S.classes[0],'1');eq(ctx.r2(r.rows[0].mi),(0+10)/2,'absent noté 0 si zabs');
ctx.S=base();ctx.S.notes.e1.a='A';
r=ctx.calc(ctx.S.classes[0],'1');eq(ctx.r2(r.rows[0].mi),10,'absent ignoré si zabs inactif');
// Note sur 10 ramenée sur 20
ctx.S=base();r=ctx.calc(ctx.S.classes[0],'1');eq(ctx.r2(r.rows[1].mi),16,'barème 10 ramené à 20');
// Aucune note
ctx.S=base();ctx.S.notes={};r=ctx.calc(ctx.S.classes[0],'1');eq(r.rows[0].m,null,'aucune note -> null');
// Autre semestre vide
ctx.S=base();r=ctx.calc(ctx.S.classes[0],'2');eq(r.rows[0].m,null,'semestre 2 vide');
// Statistiques d'assiduité
ctx.S=base();ctx.S.att={'2026-01-01|c1':{a:'A',b:'R'},'2026-01-02|c1':{a:'A',c:'M'}};ctx.S.inc=[{sid:'a'}];
eq(ctx.stats('a'),{a:2,r:0,m:0,i:1},'stats élève A');
eq(ctx.stats('b'),{a:0,r:1,m:0,i:0},'stats élève B');
console.log(ok+' réussis, '+ko+' échecs (calculs)');if(ko)process.exitCode=1;

// ---- Établissement partagé : logique client avec faux serveur ----
(async()=>{
const names=['schCache','schSetCache','schOk','schH','schRpc','schPublish','schPull','schSync','schErr','etAll','ck','sk','myRec'];
let o=0,k=0;
function t(a,b,m){if(JSON.stringify(a)===JSON.stringify(b))o++;else{k++;console.log('ÉCHEC',m,JSON.stringify(a),'≠',JSON.stringify(b))}}
const calls=[];
const rec=(n,m,cn)=>({edu:1,t:n,d:'2026-10-26',cls:[{n:cn||'6e A',mat:m,k:2,st:[{n:'Koffi Adjovi',m1:12,m2:null,q1:[],q2:[],a:1,r:0,i:0}]}]});
const store={};
const mock=async(url,opt={})=>{calls.push({url,opt});
  const ok=(b)=>({ok:true,json:async()=>b,text:async()=>JSON.stringify(b)});
  if(url.includes('/educact_rec?select'))return ok([
    {user_id:'me',class_key:'6ea',data:rec('Moi','Maths'),updated_at:'2026-10-26T10:00:00Z'},
    {user_id:'u2',class_key:'6ea',data:rec('Mme Sika','Français'),updated_at:'2026-10-26T10:05:00Z'},
    {user_id:'u2',class_key:'5eb',data:rec('Mme Sika','Français','5e B'),updated_at:'2026-10-26T10:06:00Z'},
    {user_id:'u3',class_key:'6ea',data:{bad:1},updated_at:'x'}]);
  if(url.includes('/educact_member?select'))return ok([{user_id:'me',display:'Moi',role:'pp',classes:['6ea']},{user_id:'u2',display:'Mme Sika',role:'ens',classes:[]}]);
  if(url.includes('/educact_school?select'))return ok([{name:'CEG',code:'NEWCODE1'}]);
  if(url.includes('educact_rec?on_conflict')||opt.method==='DELETE')return ok({});
  return {ok:false,text:async()=>JSON.stringify({message:'code'})};
};
const c2={S:{me:'Moi',sch:{id:'S1',name:'CEG',code:'ABCD1234',role:'ens'},etab:{},sanc:[],classes:[]},cur:{tab:'save'},RL:{ens:{n:'Enseignant'},pp:{n:'Professeur principal'}},
  localStorage:{_:{},getItem(k){return this._[k]||null},setItem(k,v){this._[k]=v}},
  navigator:{onLine:true},fetch:mock,sess:()=>({uid:'me'}),sbCfg:()=>({url:'https://x.supabase.co',key:'k'}),sbH:(c,t)=>({a:t}),tok:async()=>'T',
  role:()=>'ens',setRole(r){c2.roleSet=r},render(){},$:()=>null,save(){},myRec:()=>rec('Moi','Maths'),
  ck:s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,''),sk:s=>String(s).toLowerCase(),console};
vm.createContext(c2);
vm.runInContext(['var SCH_C=null,_sq=0,_ss=0;'].concat(names.filter(n=>!['ck','sk','myRec'].includes(n)).map(grab)).join('\n'),c2);
await c2.schPublish();
const pub=calls.find(c=>c.url.includes('on_conflict'));
t(pub.url.includes('/rest/v1/educact_rec?on_conflict=school_id,user_id,class_key'),true,'URL de publication');
const body=JSON.parse(pub.opt.body);t(Array.isArray(body),true,'une ligne par classe');
t([body[0].school_id,body[0].user_id,body[0].class_key,body[0].data.t],['S1','me','6ea','Moi'],'corps de publication');
const del=calls.find(c=>c.opt.method==='DELETE');t(!!del&&del.url.includes('class_key=not.in.'),true,'suppression des classes retirées');
await c2.schPull();
const cache=c2.schCache();
t(cache.length,1,'cache : un enseignant, entrées valides');
t(cache[0].cls.map(c=>c.n),['6e A','5e B'],'classes regroupées par enseignant');
t(cache[0].t,'Mme Sika','cache : nom');
t(c2.roleSet,'pp','rôle serveur appliqué');
t(c2.S.sch.role,'pp','rôle enregistré dans le lien');
t(c2.S.sch.cls,['6ea'],'classes du PP');
t(c2.S.sch.code,'NEWCODE1','code actualisé');
t(JSON.parse(c2.localStorage._['surv_schc']).length,1,'cache persistant hors ligne');
const all=vm.runInContext(grab('etAll')+';etAll()',Object.assign(c2,{schCache:c2.schCache}));
t(all.map(x=>x.t),['Moi','Mme Sika'],'etAll : fusion');
// doublon avec un fichier importé du même enseignant : le cloud l'emporte
c2.S.etab={mmesika:rec('Mme Sika','ANCIEN')};
const all2=vm.runInContext('etAll()',c2);
t(all2.filter(x=>x.t==='Mme Sika').length,1,'pas de doublon');
t(all2.find(x=>x.t==='Mme Sika').cls[0].mat,'Français','cloud prioritaire sur fichier');
// erreurs
let err='';try{await c2.schRpc('educact_join_school',{p_code:'X',p_display:'Y'})}catch(e){err=c2.schErr(e)}
t(err,'Code inconnu.','message code inconnu');
console.log(o+' réussis, '+k+' échecs (établissement)');if(k)process.exitCode=1;
})();

// ---- Matricules : lecture des listes et rapprochement entre enseignants ----
(()=>{
let o=0,k=0;
function t(a,b,m){if(JSON.stringify(a)===JSON.stringify(b))o++;else{k++;console.log('ÉCHEC',m,JSON.stringify(a),'≠',JSON.stringify(b))}}
const C=vm.createContext({S:{alias:{},classes:[]},nt:s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().split(/[^a-z]+/).filter(Boolean),
  ck:s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,''),uid:()=>Math.random().toString(36).slice(2),
  MTR:null,schCache:()=>[],myRec:()=>null});
const rx=js.match(/var MTR=.*?;\n/)[0];
vm.runInContext(rx+['sk','sa','rowName','isMt','mtCol','studRow','addStud','etKey','etCls','etBul','etAll','mv','aprK','srk','rg'].map(n=>{try{return grab(n)}catch(e){return ''}}).join('\n'),C);
const run=e=>vm.runInContext(e,C);
// détection du matricule
t(run("isMt('20231234A')"),true,'matricule alphanumérique');
t(run("isMt('12')"),false,'rang, pas un matricule');
t(run("isMt('KOFFI')"),false,'nom, pas un matricule');
t(run("isMt('0197000000')"),false,'téléphone, pas un matricule');
// lignes
t(run("studRow(['1','20231234A','ADJOVI Koffi Jean'],-1)"),{name:'ADJOVI Koffi Jean',mt:'20231234A'},'colonnes : rang, matricule, nom');
t(run("studRow(['ADJOVI Koffi','20231234a'],-1)"),{name:'ADJOVI Koffi',mt:'20231234A'},'nom puis matricule');
t(run("studRow(['20231234A ADJOVI Koffi Jean'],-1)"),{name:'ADJOVI Koffi Jean',mt:'20231234A'},'matricule collé devant le nom');
t(run("studRow(['ADJOVI Koffi'],-1)"),{name:'ADJOVI Koffi',mt:''},'sans matricule');
t(run("mtCol([['N°','Matricule','Nom','Prénoms']])"),1,'colonne Matricule repérée');
t(run("studRow(['1','12345678','ADJOVI','Koffi'],1)"),{name:'ADJOVI Koffi',mt:'12345678'},'matricule numérique avec en-tête');
t(run("studRow(['N°','Matricule','Nom','Prénoms'],1)"),null,"ligne d'en-tête ignorée");
// ajout sans doublon, et complétion du matricule
const cl={students:[{id:'a',name:'ADJOVI Koffi'}]};C.cl=cl;
t(run("addStud(cl,{name:'ADJOVI Koffi',mt:'20231234A'})"),2,'matricule ajouté à un élève existant');
t(cl.students[0].mt,'20231234A','matricule enregistré');
t(run("addStud(cl,{name:'ADJOVI Koffi',mt:'20231234A'})"),0,'pas de doublon');
t(run("addStud(cl,{name:'Koffi Adjovi Jean',mt:'20231234A'})"),0,'même matricule, nom différent : même élève');
t(run("addStud(cl,{name:'ADJOVI Koffi',mt:'99999999Z'})"),1,'même nom, autre matricule : autre élève');
// rapprochement entre enseignants
const st=(n,mt,m1)=>({n,mt,m1,m2:null,q1:[],q2:[],a:0,r:0,i:0});
const rec=(t,mat,sts)=>({edu:1,t,cls:[{n:'6e A',mat,k:2,st:sts}]});
C.RECS=[rec('Moi','Maths',[st('ADJOVI Koffi','20231234A',12),st('SIKA Rose','20235678B',15)]),
        rec('Mme X','Français',[st('Koffi ADJOVI Jean','20231234A',14),st('SIKA Rose','',10)])];
C.etAll=()=>C.RECS;
const M=run('etCls()'),o6=M['6ea'];
t(Object.keys(o6.st).sort(),['#20231234a','#20235678b'],'2 élèves : matricule et nom sans matricule rapprochés');
const B=run("etBul(etCls()['6ea'],'m1')");
const ko=B.rows.find(r=>r.mt==='20231234A');
t(ko.ms,[12,14],'notes des deux matières réunies malgré un nom différent');
t(B.rows.find(r=>r.mt==='20235678B').ms,[15,10],"élève sans matricule chez l'autre enseignant rattaché par son nom");
console.log(o+' réussis, '+k+' échecs (matricules)');if(k)process.exitCode=1;
})();

// ---- Passage d'année et journal des notes ----
(()=>{
let o=0,k=0;
function t(a,b,m){if(JSON.stringify(a)===JSON.stringify(b))o++;else{k++;console.log('ÉCHEC',m,JSON.stringify(a),'≠',JSON.stringify(b))}}
let n=0;
const C=vm.createContext({uid:()=>'id'+(++n),S:null,console});
vm.runInContext(['yrNext','yrPromo','yrBuild'].map(grab).join('\n'),C);
const run=e=>vm.runInContext(e,C);
t(run("yrNext('2026-2027')"),'2027-2028','année suivante');
t(run("yrNext('2026/2027')"),'2027-2028','année suivante avec /');
t(run("yrNext('')"),'','année vide');
const P=x=>run("yrPromo("+JSON.stringify(x)+")");
t(P('6ème M1'),'5ème M1','6ème → 5ème');
t(P('5ème A'),'4ème A','5ème → 4ème');
t(P('4e B'),'3ème B','4e → 3ème');
t(P('3ème A'),'','3ème : fin de cycle');
t(P('6A'),'5ème A','sans suffixe');
t(P('2nde A'),'1ère A','2nde → 1ère');
t(P('1ère D'),'Tle D','1ère → Tle');
t(P('Tle C'),'','Tle : fin de cycle');
t(P('CM2'),'','inconnu : à saisir');
// reconstruction des classes
const S0={annee:'2026-2027',me:'Moi',ecole:'CEG X',chef:'M. Chef',pp:'Mme Y',scale:[{n:'Rappel'}],regl:'Règlement',
 classes:[
  {id:'c6',name:'6ème A',t:1,students:[{id:'s1',name:'ZOHOUN Ali',mt:'M1',tel:'0197',rd:'Non'},{id:'s2',name:'ADJOVI Koffi',mt:'M2',rd:'Oui'},{id:'s3',name:'BIO Paul'},{id:'s4',name:'SIKA Rose',sx:'F'}]},
  {id:'c5',name:'5ème A',t:0,students:[{id:'s5',name:'DOSSOU Paul',rd:'Non'},{id:'s6',name:'EGBO Fatima'},{id:'s8',name:'GBAGUIDI Luc'}]},
  {id:'c3',name:'3ème A',students:[{id:'s7',name:'FAGLA Jean'}]}],
 mats:{c6:[{id:'m1',n:'Maths',coef:3}],c5:[{id:'m2',n:'Maths',coef:2}]},
 att:{'2026-01-01|c6':{s1:'A'}},inc:[{sid:'s1'}],sanc:[{sid:'s1'}],eva:[{id:'e1'}],notes:{e1:{s1:12}},apr:{x:1},alias:{a:'b'},noDup:{a:1},etab:{z:{}},log:[{a:'n'}],bk:5};
const to={c6:'5ème A',c5:'4ème A',c3:''};
// s1,s4,s2 passent ; s3 redouble ; s5 passe ; s6 redouble ; s8 exclu ; s7 termine le cycle
const dec={s1:'P',s2:'P',s3:'R',s4:'P',s5:'P',s6:'R',s7:'P',s8:'Q'};
const N=vm.runInContext('(function(S0,o){return yrBuild(S0,o)})',C)(S0,{annee:'2027-2028',to,dec});
t(N.classes.map(c=>c.name),['4ème A','5ème A','6ème A'],'classes : promotion, redoublement, 3ème sortie');
const c6=N.classes.find(c=>c.name==='6ème A'),c5=N.classes.find(c=>c.name==='5ème A'),c4=N.classes.find(c=>c.name==='4ème A');
t(c6.students.map(s=>s.name),['BIO Paul'],'6ème A : le redoublant');
t(c6.students[0].rd,'Oui','redoublant marqué Oui');
t(c5.students.map(s=>s.name).sort(),['ADJOVI Koffi','EGBO Fatima','SIKA Rose','ZOHOUN Ali'],'5ème A : promus de 6ème + redoublant de 5ème');
t(c4.students.map(s=>s.name),['DOSSOU Paul'],'4ème A : promu de 5ème');
t(c5.students.find(s=>s.name==='ADJOVI Koffi').rd,'Non','ancien redoublant promu : redoublant remis à Non');
t(c5.students.find(s=>s.name==='ZOHOUN Ali').mt,'M1','matricule conservé');
t(c5.students.find(s=>s.name==='ZOHOUN Ali').tel,'0197','téléphone conservé');
t(c5.students.find(s=>s.name==='SIKA Rose').sx,'F','sexe conservé');
t(N.classes.some(c=>c.students.some(s=>s.id==='s8'||s.id==='s7')),false,'exclu et fin de cycle absents');
t(N.mats[c5.id].map(m=>m.n+':'+m.coef),['Maths:3'],'matières reprises de la classe source (première rencontrée)');
t([N.att,N.inc,N.sanc,N.eva,N.notes,N.apr,N.alias,N.noDup,N.etab,N.log],[{},[],[],[],{},{},{},{},{},[]],"données de l'année remises à zéro");
t([N.annee,N.me,N.ecole,N.chef,N.regl,N.pp,N.bk],['2027-2028','Moi','CEG X','M. Chef','Règlement','',0],'paramètres conservés, PP vidé');
t(N.classes.every(c=>c.id!=='c6'&&c.id!=='c5'),true,'nouveaux identifiants de classe');
t(S0.classes.length+':'+S0.inc.length,'3:1',"l'original n'est pas modifié");
console.log(o+' réussis, '+k+' échecs (année et journal)');if(k)process.exitCode=1;
})();

// ---- Résultats publiés : une entrée par classe ET par matière ----
(()=>{
let o=0,k=0;
function t(a,b,m){if(JSON.stringify(a)===JSON.stringify(b))o++;else{k++;console.log('ÉCHEC',m,JSON.stringify(a),'≠',JSON.stringify(b))}}
const C=vm.createContext({S:null,cur:{gc:'c1',gm:'',gp:'1'},today:()=>'2026-10-26',overdue:()=>[],console});
vm.runInContext(['r2','tcls','gcl','getMats','curMat','calc','qa','stats','myRec'].map(grab).join('\n'),C);
C.S={me:'Prof',sanc:[],att:{},inc:[],zabs:false,log:[],
 classes:[{id:'c1',name:'6e A',t:1,students:[{id:'a',name:'A'},{id:'b',name:'B'}]},{id:'c2',name:'5e B',t:1,students:[{id:'c',name:'C'}]}],
 mats:{c1:[{id:'m1',n:'Maths',coef:3},{id:'m2',n:'Physique',coef:2}],c2:[{id:'m3',n:'Maths',coef:4}]},
 eva:[{id:'e1',cid:'c1',mid:'m1',per:'1',t:'I',m:20},{id:'e2',cid:'c1',mid:'m2',per:'1',t:'I',m:20},{id:'e3',cid:'c2',mid:'m3',per:'1',t:'I',m:20}],
 notes:{e1:{a:10,b:12},e2:{a:14,b:16},e3:{c:18}}};
const r=C.myRec();
t(r.cls.map(c=>c.n+'/'+c.mat+'/'+c.k),['6e A/Maths/3','6e A/Physique/2','5e B/Maths/4'],'une entrée par classe et par matière, avec le bon coefficient');
t(r.cls[0].st.map(s=>s.m1),[10,12],'notes de Maths en 6e A');
t(r.cls[1].st.map(s=>s.m1),[14,16],'notes de Physique en 6e A');
t(r.cls[2].st.map(s=>s.m1),[18],"notes de la 5e B calculées même si la classe affichée est la 6e A");
C.S.mats.c2=[];
t(vm.runInContext('myRec()',C).cls[2].mat,'','classe sans matière : roster publié sans notes');
console.log(o+' réussis, '+k+' échecs (résultats publiés)');if(k)process.exitCode=1;
})();
