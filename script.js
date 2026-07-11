"use strict";

// Supabase projenizi oluşturduktan sonra yalnızca bu iki değeri değiştirin.
// Publishable key tarayıcıda kullanılmak üzere tasarlanmıştır; secret/service_role key kullanmayın.
const CLOUD_CONFIG = {
  url: "https://mhnkaqwjscsvlfxrbtfb.supabase.co",
  publishableKey: "sb_publishable_TWPHV11M9FjmuSCs6AZ1Qg_Z5Nh80By"
};

const isCloudConfigured = Boolean(
  CLOUD_CONFIG.url.startsWith("https://") &&
  !CLOUD_CONFIG.url.includes("YOUR_PROJECT") &&
  CLOUD_CONFIG.publishableKey &&
  !CLOUD_CONFIG.publishableKey.includes("YOUR_SUPABASE")
);

const cloudClient = isCloudConfigured && window.supabase
  ? window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true }
    })
  : null;

let cloudSession = null;
let cloudSyncTimer = null;
let teacherStore = { classes: [], students: [], activeClassId: null, selectedStudentId: null };

const STORAGE_KEYS = {
  settings: "vdca_settings",
  answers: "vdca_module_answers",
  checks: "vdca_module_checks",
  completed: "vdca_module_completed",
  plan: "vdca_weekly_plan",
  quizzes: "vdca_module_quizzes",
  activities: "vdca_module_activities",
  cloudSession: "vdca_cloud_session"
};

const DAYS = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const TEACHER_TIPS = [
  "Her gün aynı saatte çalışmak alışkanlık kazandırır.",
  "Telefonu masadan uzaklaştırmak odaklanmayı kolaylaştırır.",
  "Yanlışlarını silme; onları incele ve sana ne anlattıklarını bul.",
  "Kısa tekrarlar bilgiyi kalıcı hâle getirir.",
  "Planını çok zor yaparsan uygulamak istemeyebilirsin. Küçük başla.",
  "Deneme sınavı sonucu sadece puan değildir, bir yol haritasıdır.",
  "Önce küçük hedef koy, sonra adım adım büyüt.",
  "Çalışırken tek işe odaklan. Bir işi bitirince diğerine geç."
];

const MODULES = [
  {
    id: 1,
    icon: "🗓️",
    title: "Nasıl Plan Yapılır?",
    short: "Gerçekçi ve uygulanabilir bir haftalık çalışma planı oluştur.",
    description: "Plan yapmak, neye ne zaman çalışacağını bilmeni sağlar. Plansız çalışan bir öğrenci çoğu zaman nereden başlayacağını bilemez. İyi bir plan seni yormaz; sana yol gösterir. Planında ders kadar dinlenmeye de yer vermen önemlidir.",
    goal: "Bu modülün sonunda haftalık ders çalışma planı hazırlamayı öğreneceksin.",
    lesson: [
      ["🎯", "Önceliğini bul", "Önce en çok gelişmek istediğin dersi seç."],
      ["⏱️", "Süreyi küçük tut", "Uygulayabileceğin süreler belirle. 25 dakika iyi bir başlangıç olabilir."],
      ["🌿", "Dinlenmeyi unutma", "Kısa molalar zihninin yeniden güç toplamasını sağlar."]
    ],
    story: "Ece, bütün derslere aynı gün çalışmaya karar verdi. Bir süre sonra yoruldu ve planını bıraktı. Ertesi hafta her güne yalnızca iki küçük görev yazdı. Bu kez planını uygulamak daha kolay oldu.",
    task: "Kendi haftalık ders planının ilk taslağını hazırla. Cevapların kısa olabilir; önemli olan planının sana uygun olması.",
    fields: [
      ["priorityLesson", "Bu hafta en çok hangi derse çalışmalıyım?", "text", "Örnek: Türkçe"],
      ["topics", "Bu hafta hangi konulara odaklanacağım?", "textarea", "Örnek: Paragrafta ana fikir ve yardımcı fikir"],
      ["dailyMinutes", "Günde kaç dakika çalışacağım?", "number", "Örnek: 30"],
      ["studyDays", "Hangi günler çalışacağım?", "text", "Örnek: Pazartesi, Çarşamba ve Cumartesi"],
      ["hardestDay", "En zorlanacağım gün hangisi?", "text", "Örnek: Salı"],
      ["promise", "Planımı uygulamak için kendime vereceğim küçük söz nedir?", "textarea", "Örnek: Başlamak istemesem bile ilk 10 dakikayı deneyeceğim."]
    ],
    checks: ["Çalışacağım dersleri yazdım.", "Zorlandığım konuları belirledim.", "Günlük çalışma süremi seçtim.", "Dinlenme zamanımı ekledim.", "Planımı gerçekçi yaptım."]
  },
  {
    id: 2,
    icon: "🛡️",
    title: "Dikkat Dağıtıcılarla Nasıl Baş Edilir?",
    short: "Odaklanmanı zorlaştıran şeyleri fark et ve etkilerini azalt.",
    description: "Telefon, bildirimler, gürültü ve dağınık masa odaklanmayı zorlaştırabilir. Dikkat dağıtıcıları tamamen yok etmek her zaman mümkün değildir. Fakat onları azaltmak mümkündür. Önceden alacağın küçük önlemler çalışmaya daha kolay başlamanı sağlar.",
    goal: "Bu modülün sonunda kendi dikkat koruma planını oluşturabileceksin.",
    lesson: [
      ["👀", "Dikkatini gözle", "Dikkatinin ne zaman ve neden dağıldığını fark et."],
      ["📵", "Uzağa koy", "Telefonu sessize almak yetmeyebilir. Görüş alanından da çıkar."],
      ["🧹", "Alanını sadeleştir", "Masanda yalnızca o ders için gerekli malzemeler bulunsun."]
    ],
    story: "Mert, ders çalışırken gelen her bildirime bakıyordu. Telefonunu başka odaya bırakıp 20 dakikalık bir sayaç kurdu. Süre bitince bildirimlerini kontrol etti. Böylece hem merakı azaldı hem çalışmasını tamamladı.",
    task: "Seni en çok etkileyen dikkat dağıtıcıları belirle ve bugün kullanacağın bir önlem seç.",
    fields: [
      ["mainDistractor", "Ders çalışırken dikkatimi en çok ne dağıtıyor?", "textarea", "Telefon, sesler, düşünceler..."],
      ["phonePlace", "Telefonu nereye koyabilirim?", "text", "Örnek: Salondaki çekmeceye"],
      ["deskItems", "Çalışma masamda olmaması gereken şeyler neler?", "textarea", "Örnek: Oyun konsolu ve gereksiz kâğıtlar"],
      ["noisePlan", "Gürültü varsa ne yapabilirim?", "textarea", "Kullanabileceğin sakin bir çözüm yaz."],
      ["todayAction", "Bugün dikkatimi korumak için hangi önlemi alacağım?", "textarea", "Tek ve uygulanabilir bir önlem seç."]
    ],
    checks: ["Telefonumu görüş alanımdan çıkaracağım.", "Masamda sadece gerekli malzemeleri bırakacağım.", "Bildirimleri kapatacağım.", "Kısa süreli çalışma hedefi seçeceğim."]
  },
  {
    id: 3,
    icon: "🔁",
    title: "Etkili Tekrar Nasıl Yapılır?",
    short: "Unutmayı azaltan kısa ve aralıklı tekrar düzeni kur.",
    description: "Bir konuyu bir kez çalışmak çoğu zaman yeterli olmaz. Bilginin kalıcı olması için belirli aralıklarla tekrar yapmak gerekir. Etkili tekrar uzun olmak zorunda değildir. Kısa özetler, sorular ve küçük testler unutmayı azaltır.",
    goal: "Bu modülün sonunda üç günlük bir tekrar planı hazırlayabileceksin.",
    lesson: [
      ["📝", "Kısaca özetle", "Konuyu kendi cümlelerinle birkaç satırda anlat."],
      ["📆", "Aralıklı dön", "Aynı konuya ertesi gün, üç gün sonra ve bir hafta sonra bak."],
      ["❓", "Kendini sına", "Sadece okumak yerine sorulara cevap vermeyi dene."]
    ],
    story: "Zeynep, fen konusunu sınavdan önce uzun süre çalışıyordu ama çabuk unutuyordu. Konuya ertesi gün 10 dakika, üç gün sonra da 10 soru ayırdı. Bilgileri daha kolay hatırladığını gördü.",
    task: "Bugün öğrendiğin bir konu için üç günlük tekrar planı hazırla.",
    fields: [
      ["todayTopic", "Bugün hangi konuyu öğrendim?", "text", "Örnek: Maddenin hâlleri"],
      ["tomorrowReview", "Bu konuyu yarın nasıl tekrar edeceğim?", "textarea", "Örnek: Notlarıma bakıp 5 soru çözeceğim."],
      ["thirdDayQuestions", "3 gün sonra hangi soruları çözeceğim?", "textarea", "Soru kaynağını veya soru türünü yaz."],
      ["weekTest", "Bir hafta sonra kendimi nasıl test edeceğim?", "textarea", "Örnek: Notlara bakmadan konuyu anlatacağım."]
    ],
    checks: ["Konuyu kısa notla özetledim.", "Ertesi gün tekrar zamanı belirledim.", "Test çözme günü ekledim.", "Zorlandığım yeri işaretledim."]
  },
  {
    id: 4,
    icon: "✍️",
    title: "Not Tutma Yöntemleri",
    short: "Bilgiyi seç, sadeleştir ve kendi cümlelerinle düzenle.",
    description: "Not tutmak, bilgiyi sadece yazmak değildir. Önemli olan bilgiyi seçmek, kısaltmak ve anlaşılır hâle getirmektir. Kendi cümlelerinle yazdığın notu hatırlaman daha kolay olur. İyi bir not, tekrar yaparken sana zaman kazandırır.",
    goal: "Bu modülün sonunda kısa, düzenli ve işe yarayan bir konu özeti çıkarabileceksin.",
    lesson: [
      ["🔑", "Anahtar kelime seç", "Her cümleyi değil, temel kavramları yaz."],
      ["💬", "Kendi dilini kullan", "Bilgiyi anlayarak ve sadeleştirerek anlat."],
      ["🧩", "Örnek ekle", "Bir örnek, bilgiyi hatırlaman için güçlü bir ipucudur."]
    ],
    story: "Arda, öğretmenin söylediği her şeyi yazmaya çalışınca konuyu kaçırıyordu. Sonra yalnızca anahtar kelimeleri ve bir örneği yazdı. Ders sonunda bu kelimelere bakarak konuyu kendi cümleleriyle anlatabildi.",
    task: "Seçtiğin bir konunun kısa özetini oluştur. En önemli üç bilgiyi kendi cümlelerinle yaz.",
    fields: [
      ["noteTopic", "Bugün hangi konudan not çıkaracağım?", "text", "Örnek: Fiiller"],
      ["topThree", "Konunun en önemli 3 bilgisi nedir?", "textarea", "Bilgileri 1, 2, 3 diye sıralayabilirsin."],
      ["example", "Bu konuyla ilgili bir örnek yaz.", "textarea", "Kendi örneğini oluştur."],
      ["unclearPart", "Anlamadığım yer neresi?", "textarea", "Anlamadığın yer yoksa bunu da yazabilirsin."],
      ["selfQuestion", "Bu notu tekrar ederken kendime hangi soruyu soracağım?", "textarea", "Örnek: Fiili nasıl bulurum?"]
    ],
    checks: ["Gereksiz ayrıntıları yazmadım.", "Anahtar kelimeleri belirledim.", "Kendi cümlelerimi kullandım.", "Örnek ekledim."]
  },
  {
    id: 5,
    icon: "🔎",
    title: "Okuduğunu Daha İyi Anlama",
    short: "Bir metnin konusunu, ana fikrini ve önemli ayrıntılarını bul.",
    description: "Okuduğunu anlamak sadece metni seslendirmek değildir. Metnin konusunu, ana fikrini ve önemli ayrıntılarını fark etmek gerekir. Bilmediğin kelimeleri bulmak da anlamayı güçlendirir. Okuma sonunda metni kendi cümlelerinle anlatabiliyorsan doğru yoldasın.",
    goal: "Bu modülün sonunda kısa bir metni temel unsurlarıyla analiz edebileceksin.",
    lesson: [
      ["📌", "Konuyu bul", "Metnin en çok neden söz ettiğini belirle."],
      ["💡", "Ana fikri yakala", "Yazarın asıl vermek istediği düşünceyi sor."],
      ["🗣️", "Kendi cümlenle anlat", "Metni birkaç cümleyle yeniden anlatmayı dene."]
    ],
    story: "Selin, bir paragrafı hızlıca okuyup sorulara geçtiğinde ayrıntıları karıştırıyordu. Önce başlığa baktı, sonra her paragrafın yanına bir anahtar kelime yazdı. Metnin ana fikrini bulması kolaylaştı.",
    task: "Kısa bir metin seç ve aşağıdaki sorularla metni incele.",
    fields: [
      ["textName", "Okuduğum metnin adı nedir?", "text", "Metnin başlığını yaz."],
      ["subject", "Metnin konusu nedir?", "textarea", "Metinde en çok neden söz ediliyor?"],
      ["mainIdea", "Metnin ana fikri nedir?", "textarea", "Yazar bize asıl ne anlatmak istiyor?"],
      ["importantInfo", "Metindeki en önemli bilgi nedir?", "textarea", "Sence en önemli ayrıntıyı yaz."],
      ["conclusion", "Metinden çıkardığım sonuç nedir?", "textarea", "Kendi düşünceni yaz."],
      ["unknownWords", "Anlamını bilmediğim kelimeler neler?", "textarea", "Yoksa “Bilmediğim kelime yok.” yazabilirsin."]
    ],
    checks: ["Metni dikkatlice okudum.", "Konuyu belirledim.", "Ana fikri yazdım.", "Bilmediğim kelimeleri not aldım.", "Metni kendi cümlelerimle özetledim."]
  },
  {
    id: 6,
    icon: "🧭",
    title: "Soru Çözerken Hata Analizi",
    short: "Yanlışlarının nedenini bul ve bir sonraki adımını belirle.",
    description: "Yanlış yapmak başarısızlık değildir. Yanlışlar, neyi öğrenmen gerektiğini gösteren işaretlerdir. Önemli olan yanlışı fark etmek ve nedenini bulmaktır. Hata nedenini bilirsen aynı hatayı azaltmak için doğru adımı seçebilirsin.",
    goal: "Bu modülün sonunda yanlış sorularını nedenlerine göre inceleyebileceksin.",
    lesson: [
      ["🔍", "Nedeni ara", "Yanlışın konu, dikkat, işlem veya zaman kaynaklı olabilir."],
      ["📒", "Hata notu tut", "Kısa bir not, aynı hatayı tekrar fark etmeni sağlar."],
      ["🧪", "Benzerini dene", "Eksik olduğun türden birkaç yeni soru çöz."]
    ],
    story: "Can, matematik testinde yaptığı üç yanlışı yeniden çözdü. İkisinde soruyu hızlı okuduğunu, birinde de konuyu karıştırdığını fark etti. Bir sonraki testte soru köklerinin altını çizdi ve konu notuna geri döndü.",
    task: "Son çözdüğün bir testin sonuçlarını incele ve en önemli hata nedenini belirle.",
    fields: [
      ["lesson", "Hangi dersten soru çözdüm?", "text", "Örnek: Matematik"],
      ["correct", "Kaç doğru yaptım?", "number", "Örnek: 12"],
      ["wrong", "Kaç yanlış yaptım?", "number", "Örnek: 3"],
      ["errorReason", "Yanlışımın sebebi neydi?", "select", "Bir neden seç.", ["Konuyu bilmiyordum.", "Soruyu dikkatli okumadım.", "İşlem hatası yaptım.", "Zamanı iyi kullanamadım.", "İki seçenek arasında kaldım."]],
      ["nextTime", "Bir sonraki çözümde neye dikkat edeceğim?", "textarea", "Kendine kısa bir hatırlatma yaz."]
    ],
    checks: ["Yanlış soruları işaretledim.", "Hata nedenini yazdım.", "Konu eksiğimi belirledim.", "Benzer soru çözeceğim."]
  },
  {
    id: 7,
    icon: "📊",
    title: "Deneme Sınavı Nasıl Analiz Edilir?",
    short: "Deneme sonucunu puandan öteye taşı ve yol haritasına çevir.",
    description: "Deneme sınavı sadece puan görmek için yapılmaz. Deneme, güçlü olduğun ve desteğe ihtiyaç duyduğun konuları gösterir. Doğru ve yanlış sayılarını incelemek ilk adımdır. Asıl gelişim, bu sonuçtan yeni bir çalışma hedefi çıkardığında başlar.",
    goal: "Bu modülün sonunda bir deneme sınavını derslere ve hedeflere göre inceleyebileceksin.",
    lesson: [
      ["📋", "Sonucu yaz", "Her dersin doğru ve yanlış sayısını ayrı ayrı gör."],
      ["🧠", "Nedeni düşün", "Konu eksiği, dikkat ve zaman durumunu değerlendir."],
      ["🚀", "Üç konu seç", "Sonraki denemeye kadar çalışacağın üç konu belirle."]
    ],
    story: "Defne, denemede yalnızca toplam puanına bakıp üzülüyordu. Son denemesinde yanlışlarını derslere ayırdı. Türkçede paragraf, matematikte kesirler konusuna odaklanınca sonraki denemede ilerleme gördü.",
    task: "Son deneme sınavının sonuçlarını yaz ve bir sonraki denemeye kadar üç çalışma konusu seç.",
    fields: [
      ["examDate", "Deneme sınavı tarihi", "date", ""],
      ["turkish", "Türkçe doğru / yanlış", "text", "Örnek: 16 doğru / 4 yanlış"],
      ["math", "Matematik doğru / yanlış", "text", "Örnek: 12 doğru / 6 yanlış"],
      ["science", "Fen doğru / yanlış", "text", "Örnek: 15 doğru / 5 yanlış"],
      ["social", "Sosyal doğru / yanlış", "text", "Örnek: 8 doğru / 2 yanlış"],
      ["english", "İngilizce doğru / yanlış", "text", "Örnek: 9 doğru / 1 yanlış"],
      ["bestLesson", "En başarılı olduğum ders", "text", "Bir ders yaz."],
      ["hardLesson", "En çok zorlandığım ders", "text", "Bir ders yaz."],
      ["timeEnough", "Zamanı yetiştirebildim mi?", "select", "Seçimini yap.", ["Evet, yetiştirdim.", "Kısmen yetiştirdim.", "Hayır, yetiştiremedim."]],
      ["nextTopics", "Bir sonraki denemeye kadar çalışacağım 3 konu", "textarea", "Konuları 1, 2, 3 diye sıralayabilirsin."]
    ],
    checks: ["Doğru ve yanlışlarımı yazdım.", "En zayıf dersimi belirledim.", "Konu eksiğimi yazdım.", "Yeni hedef belirledim."]
  },
  {
    id: 8,
    icon: "🌤️",
    title: "Sınav Kaygısıyla Baş Etme",
    short: "Heyecanını fark et, nefesini düzenle ve kendine destek ol.",
    description: "Sınav öncesi heyecan normaldir. Ancak kaygı çok artarsa bildiklerini hatırlamak zorlaşabilir. Kaygıyı azaltmak için nefes, hazırlık ve doğru düşünme önemlidir. Amaç kaygıyı tamamen yok etmek değil, onu yönetebilmektir.",
    goal: "Bu modülün sonunda sınav öncesi ve sınav anı için sakinleşme planı hazırlayabileceksin.",
    lesson: [
      ["🫁", "Nefesini yavaşlat", "Dört saniye nefes al, dört saniye bekle, dört saniye ver."],
      ["💭", "Cümleni değiştir", "“Yapamam” yerine “Elimden gelen adımı uygulayabilirim” de."],
      ["🎒", "Önceden hazırlan", "Malzemelerini ve uyku düzenini son güne bırakma."]
    ],
    story: "Bora, sınavdan önce kalbinin hızlı attığını hissediyordu. Sınav başlamadan önce üç kez yavaşça nefes aldı ve “Önce bildiğim sorulardan başlayacağım.” dedi. Heyecanı tamamen geçmedi ama onu yönetebildi.",
    task: "Sınav öncesinde kullanabileceğin kişisel sakinleşme planını yaz.",
    fields: [
      ["worry", "Sınav öncesi beni en çok ne kaygılandırıyor?", "textarea", "Aklından geçen düşünceyi yaz."],
      ["bodyFeeling", "Kaygılanınca vücudumda ne hissediyorum?", "textarea", "Örnek: Kalbim hızlı atıyor."],
      ["positiveSentence", "Kendime söyleyeceğim olumlu cümle nedir?", "textarea", "Sana güç veren gerçekçi bir cümle yaz."],
      ["preparation", "Sınavdan önce nasıl hazırlanacağım?", "textarea", "Uyku, malzemeler ve tekrar planını düşün."],
      ["breathing", "Kaygı anında hangi nefes egzersizini yapacağım?", "textarea", "Örnek: 4 saniye al, 4 bekle, 4 ver."]
    ],
    checks: ["Kaygımı fark ettim.", "Olumlu cümle yazdım.", "Nefes egzersizi belirledim.", "Sınav öncesi hazırlık planı yaptım."]
  },
  {
    id: 9,
    icon: "⏳",
    title: "Zaman Yönetimi",
    short: "Gününü gözden geçir ve ders, mola, eğlence dengesini kur.",
    description: "Zamanı iyi yönetmek, daha çok çalışmak değil, zamanı doğru kullanmaktır. Kısa ama düzenli çalışma uzun ve plansız çalışmadan daha etkilidir. Günündeki boşlukları fark edersen yapmak istediklerine yer açabilirsin. Eğlence ve dinlenme de dengeli bir planın parçasıdır.",
    goal: "Bu modülün sonunda kendi günlük zaman çizelgeni oluşturabileceksin.",
    lesson: [
      ["🕰️", "Boş zamanı gör", "Okul, yemek ve uyku dışındaki zamanlarını belirle."],
      ["⚡", "Güçlü saatini seç", "Daha dinç olduğun saati önemli görev için kullan."],
      ["⚖️", "Denge kur", "Ders, mola ve eğlence için belirli süreler ayır."]
    ],
    story: "İpek, okuldan sonra zamanının kalmadığını düşünüyordu. Bir gününü yazınca oyun ve telefon için fark etmeden iki saat ayırdığını gördü. Bu sürenin 30 dakikasını derse ayırıp yine dinlenmeye zaman bıraktı.",
    task: "Bugünün zaman çizelgesini düşün ve çalışma için sana uygun bir aralık seç.",
    fields: [
      ["freeHours", "Okuldan sonra hangi saatlerde boşum?", "text", "Örnek: 17.00–20.00"],
      ["bestHour", "Gün içinde en verimli olduğum saat hangisi?", "text", "Örnek: 18.00"],
      ["studyMinutes", "Ders çalışma için kaç dakika ayıracağım?", "number", "Örnek: 40"],
      ["breakTime", "Mola saatim ne zaman olacak?", "text", "Örnek: 18.25"],
      ["funTime", "Telefon veya oyun için ne kadar zaman ayıracağım?", "text", "Örnek: 45 dakika"],
      ["todayImprove", "Bugün zamanımı daha iyi kullanmak için ne yapacağım?", "textarea", "Tek bir küçük değişiklik yaz."]
    ],
    checks: ["Boş zamanlarımı belirledim.", "Ders saatimi seçtim.", "Mola ekledim.", "Eğlence zamanımı sınırladım."]
  },
  {
    id: 10,
    icon: "🏆",
    title: "Hedef Belirleme",
    short: "Net, ölçülebilir ve ulaşılabilir hedeflerle ilerle.",
    description: "Hedef belirlemek, nereye gitmek istediğini bilmektir. Belirsiz hedefler yerine ölçülebilir ve ulaşılabilir hedefler koymak daha etkilidir. Büyük bir hedefi günlük küçük adımlara bölebilirsin. İlerlediğini görmek devam etme isteğini güçlendirir.",
    goal: "Bu modülün sonunda haftalık ve aylık, ölçülebilir bir hedef yazabileceksin.",
    lesson: [
      ["📍", "Net ol", "“Daha çok çalışacağım” yerine ne yapacağını açıkça yaz."],
      ["📏", "Ölçülebilir yap", "Kaç soru, kaç dakika veya kaç gün olduğunu belirt."],
      ["🪜", "Adımlara böl", "Her gün yapabileceğin küçük bir hareket seç."]
    ],
    story: "Emir, “Türkçemi geliştireceğim” diye hedef koydu ama nereden başlayacağını bilemedi. Hedefini “Bu hafta dört gün, 15 paragraf sorusu çözeceğim” diye değiştirdi. Her gün yaptığı adımı kolayca takip etti.",
    task: "Kendine bir haftalık ve bir aylık hedef yaz. Hedeflerinin nasıl ölçüleceğini de belirt.",
    fields: [
      ["weeklyGoal", "Bu haftaki ders hedefim nedir?", "textarea", "Net ve küçük bir hedef yaz."],
      ["measurement", "Bu hedefi nasıl ölçeceğim?", "textarea", "Sayı, süre veya gün belirtebilirsin."],
      ["dailyStep", "Hedefime ulaşmak için her gün ne yapacağım?", "textarea", "Günlük küçük adımını yaz."],
      ["monthlyGoal", "Bu ay hangi konuda gelişmek istiyorum?", "textarea", "Bir ders veya beceri seç."],
      ["reward", "Hedefime ulaşırsam kendimi nasıl ödüllendireceğim?", "textarea", "Sana iyi gelecek küçük bir ödül seç."]
    ],
    checks: ["Hedefim net.", "Hedefim ölçülebilir.", "Hedefim gerçekçi.", "Hedefim için günlük adım belirledim."]
  }
];

const MODULE_EXTRAS = {
  1: {
    duration: "12–15 dk.",
    warmup: "Geçen hafta yapmak isteyip de ertelediğin bir ders görevi oldu mu? Sence başlamanı zorlaştıran neydi?",
    steps: ["Bu haftaki derslerini ve sorumluluklarını listele.", "En önemli iki önceliğini seç.", "Görevleri 20–30 dakikalık küçük parçalara böl.", "Planında mola ve beklenmedik durumlar için boşluk bırak."],
    powerTip: "Planına yüzde 80 doluluk hedefi koy. Her dakikayı doldurmazsan planın daha esnek ve uygulanabilir olur.",
    commonMistake: "Bir güne çok fazla görev yazmak. Yapamadığında plan kötü değildir; yalnızca küçültülmeye ihtiyacı vardır.",
    quiz: { question: "Aşağıdakilerden hangisi uygulanabilir bir plan örneğidir?", options: ["Cumartesi bütün konuları bitireceğim.", "Salı 18.00'de 25 dakika paragraf çözeceğim.", "Her gün çok uzun çalışacağım."], answer: 1, explanation: "Net gün, saat, süre ve görev içeren planları uygulamak daha kolaydır." }
  },
  2: {
    duration: "10–12 dk.",
    warmup: "Son çalışmanda dikkatin ilk kez ne zaman dağıldı? O anda çevrende veya aklında ne vardı?",
    steps: ["Seni en çok bölen üç şeyi fark et.", "Çalışma alanından bir dikkat dağıtıcıyı çıkar.", "20 dakikalık tek görev seç.", "Süre bitince kısa bir mola ver ve kendini değerlendir."],
    powerTip: "Telefonu sessize almak yerine başka bir odaya koymak, onu kontrol etme isteğini belirgin biçimde azaltabilir.",
    commonMistake: "Aynı anda müzik, mesaj ve dersle ilgilenmeye çalışmak. Beyin görevler arasında geçerken zaman ve enerji kaybeder.",
    quiz: { question: "Dikkatini korumak için en güçlü ilk adım hangisidir?", options: ["Telefonu masada ters çevirmek", "Bildirim gelince kısa bakmak", "Telefonu görüş alanından çıkarmak"], answer: 2, explanation: "Görüş alanında olmayan bir dikkat dağıtıcıyı kontrol etme isteği genellikle daha az olur." }
  },
  3: {
    duration: "12–15 dk.",
    warmup: "Bir konuyu çalıştıktan birkaç gün sonra unuttuğunu fark ettiğin oldu mu? O konuyu nasıl tekrar etmiştin?",
    steps: ["Ders bitince konuyu üç cümleyle özetle.", "Ertesi gün notlara bakmadan hatırlamayı dene.", "Üç gün sonra birkaç soru çöz.", "Bir hafta sonra kendine küçük bir test uygula."],
    powerTip: "Tekrar sırasında önce hafızandan anlat, sonra notunu aç. Hatırlamaya çalışmak öğrenmeyi güçlendirir.",
    commonMistake: "Aynı notu tekrar tekrar yalnızca okumak. Etkili tekrar, bilgiyi hatırlamaya çalışmayı ve soru çözmeyi içerir.",
    quiz: { question: "Hangi tekrar yöntemi bilgiyi daha kalıcı yapar?", options: ["Konuyu bir gecede üç kez okumak", "Farklı günlerde kısa tekrarlar yapmak", "Sadece sınav sabahı göz atmak"], answer: 1, explanation: "Aralıklı tekrar, unutmaya başladığın bilgiyi yeniden güçlendirir." }
  },
  4: {
    duration: "15–18 dk.",
    warmup: "Bir sayfa dolusu not mu, yoksa anahtar kelimelerle hazırlanmış kısa bir özet mi sana daha çok yardımcı olur? Neden?",
    steps: ["Konunun başlığını ve temel sorusunu yaz.", "En önemli üç bilgiyi seç.", "Bilgiyi kendi cümlelerinle kısalt.", "Bir örnek, sembol veya küçük soru ekle."],
    powerTip: "Sayfanın sonunda iki satırlık “Ben ne öğrendim?” kutusu bırak. Tekrar ederken önce bu kutuya bak.",
    commonMistake: "Öğretmenin söylediği her cümleyi yazmaya çalışmak. Seçmeden yazmak, dinlemeyi ve anlamayı zorlaştırabilir.",
    quiz: { question: "İyi bir ders notunda hangisi bulunmalıdır?", options: ["Her cümlenin aynısı", "Yalnızca renkli başlıklar", "Anahtar kelimeler ve kendi cümlelerin"], answer: 2, explanation: "Seçilmiş anahtar kelimeler ve kendi cümlelerin, konuyu gerçekten anlamana yardım eder." }
  },
  5: {
    duration: "15–20 dk.",
    warmup: "Bir metni bitirdiğinde kendine ilk hangi soruyu soruyorsun: “Ne anlatıldı?” mı, “Kaç satırdı?” mı?",
    steps: ["Başlığa bak ve metnin ne hakkında olacağını tahmin et.", "Okurken önemli kelimeleri fark et.", "Her bölüm için kısa bir anahtar kelime seç.", "Metni kapatıp ana fikri kendi cümlenle söyle."],
    powerTip: "Ana fikir çoğu zaman metindeki bütün örnekleri bir araya getiren genel düşüncedir; tek bir ayrıntı değildir.",
    commonMistake: "Ana fikir yerine metindeki ilginç bir ayrıntıyı yazmak. Kendine “Yazar bu metni neden yazdı?” diye sor.",
    quiz: { question: "Ana fikir neyi anlatır?", options: ["Metindeki tek bir ayrıntıyı", "Yazarın asıl vermek istediği düşünceyi", "Metnin kaç paragraf olduğunu"], answer: 1, explanation: "Ana fikir, metnin bütününü kapsayan temel mesajdır." }
  },
  6: {
    duration: "12–15 dk.",
    warmup: "Yanlış yaptığın bir soruyu gördüğünde ilk tepkin ne oluyor: geçmek, silmek, yoksa nedenini aramak mı?",
    steps: ["Yanlış soruyu yeniden ve yavaşça oku.", "Hatanın türünü belirle: konu, dikkat, işlem veya zaman.", "Doğru çözümü kendi cümlenle açıkla.", "Aynı beceriyi ölçen iki benzer soru çöz."],
    powerTip: "Bir “hata günlüğü” oluştur. Yalnızca yanlış cevabı değil, bir dahaki sefere yapacağın değişikliği de yaz.",
    commonMistake: "Doğru seçeneği görüp hemen geçmek. Çözümün neden doğru olduğunu açıklayamıyorsan öğrenme henüz tamamlanmamıştır.",
    quiz: { question: "Bir yanlış sorudan sonra en yararlı adım hangisidir?", options: ["Soruyu silmek", "Hata nedenini belirleyip benzer soru çözmek", "Sadece doğru cevabı ezberlemek"], answer: 1, explanation: "Nedeni bulmak ve benzer soru çözmek, aynı hatayı azaltmana yardım eder." }
  },
  7: {
    duration: "18–22 dk.",
    warmup: "Son denemenden sonra yalnızca puanına mı baktın, yoksa yanlışlarının hangi konulardan geldiğini de inceledin mi?",
    steps: ["Derslerin doğru ve yanlış sayılarını ayrı yaz.", "Yanlışları konu ve hata türüne göre grupla.", "Zaman kullanımını değerlendir.", "Sonraki denemeye kadar çalışacağın üç öncelik belirle."],
    powerTip: "En düşük netli ders her zaman ilk öncelik olmayabilir. Kısa çalışmayla hızlı gelişebileceğin konuya da bak.",
    commonMistake: "Sadece toplam puanı karşılaştırmak. Aynı puanın arkasında farklı konu eksikleri ve zaman sorunları olabilir.",
    quiz: { question: "Deneme analizi ne zaman tamamlanmış sayılır?", options: ["Puanı öğrendiğinde", "Arkadaşınla karşılaştırdığında", "Sonuçtan yeni çalışma hedefleri çıkardığında"], answer: 2, explanation: "Deneme, bir sonraki çalışma adımını gösterdiğinde gerçek bir yol haritasına dönüşür." }
  },
  8: {
    duration: "12–15 dk.",
    warmup: "Sınav öncesi heyecanlandığında bedeninde ilk neyi fark ediyorsun? Bu belirti sana ne söylüyor olabilir?",
    steps: ["Kaygının bedenindeki işaretini fark et.", "Nefesini yavaşlat ve ayaklarını yere hisset.", "Kendine gerçekçi, destekleyici bir cümle söyle.", "Bildiğin bir soruyla başlayıp ritmini kur."],
    powerTip: "“Hiç kaygılanmamalıyım” demek yerine “Heyecanlı olsam da adım adım ilerleyebilirim” cümlesini dene.",
    commonMistake: "Kaygıyı tehlike işareti sanmak. Bir miktar heyecan, senin bu sınava önem verdiğini ve hazırlandığını gösterebilir.",
    quiz: { question: "Kaygı yükseldiğinde hangi cümle daha destekleyicidir?", options: ["Kesin her şeyi unutacağım.", "Heyecanlıyım ama bildiğim adımları uygulayabilirim.", "Kaygılanırsam sınavım kötü geçer."], answer: 1, explanation: "Gerçekçi ve destekleyici iç konuşma, dikkatini yapabileceğin adımlara taşır." }
  },
  9: {
    duration: "12–15 dk.",
    warmup: "Bugün okuldan sonra zamanın en çok hangi etkinliğe gitti? Bu seçiminden memnun musun?",
    steps: ["Sabit saatlerini yaz: okul, yemek, uyku.", "Boş zaman aralıklarını fark et.", "En verimli saatine önemli bir görev yerleştir.", "Ders, mola ve eğlence sürelerini dengeli biçimde sınırla."],
    powerTip: "Bir işe başlayacağın saati yazmak, yalnızca “bugün yapacağım” demekten daha etkilidir.",
    commonMistake: "Mola vermeden uzun süre çalışmayı verimli sanmak. Zihnin kısa ve planlı molalarla daha iyi toparlanır.",
    quiz: { question: "Zaman yönetiminin temel amacı nedir?", options: ["Her dakikayı dersle doldurmak", "Daha az dinlenmek", "Önemli işlere uygun zamanda yer açmak"], answer: 2, explanation: "Zaman yönetimi; ders, dinlenme ve eğlence arasında bilinçli bir denge kurmaktır." }
  },
  10: {
    duration: "12–15 dk.",
    warmup: "“Derslerimde daha iyi olacağım” hedefini ölçmek mümkün mü? Bu hedefi nasıl daha açık hâle getirirdin?",
    steps: ["Geliştirmek istediğin tek bir alan seç.", "Hedefini sayı, süre veya tarih ile netleştir.", "Her gün uygulayacağın küçük adımı belirle.", "Hafta sonunda sonucunu değerlendir ve gerekirse hedefi güncelle."],
    powerTip: "Hedefin sana biraz meydan okumalı ama ulaşılmaz görünmemeli. Yüzde 70–80 başarı olasılığı iyi bir dengedir.",
    commonMistake: "Sonucu hedefleyip süreci yazmamak. “20 doğru yapmak” sonuçtur; “dört gün 15 soru çözmek” ise seni sonuca götüren süreçtir.",
    quiz: { question: "Hangisi ölçülebilir bir hedeftir?", options: ["Matematikte daha iyi olacağım.", "Bu hafta dört gün 15 problem çözeceğim.", "Çok çalışacağım."], answer: 1, explanation: "Gün ve soru sayısı belli olduğu için ilerlemeyi kolayca takip edebilirsin." }
  }
};

const ACTIVITY_LABS = {
  1: { icon: "🗂️", title: "Planlama Karar Laboratuvarı", instruction: "Her görevi en uygun planlama kararına yerleştir.", categories: ["Önce yap", "Planla", "Küçült"], items: [["Yarın teslim edilecek Türkçe ödevi", "Önce yap", "Yakın tarihli ve önemli görev önceliklidir."], ["Bir ay sonraki proje için kaynak bulmak", "Planla", "Acil değil ama takvime eklenirse unutulmaz."], ["Bir günde 200 soru çözmek", "Küçült", "Büyük görevler uygulanabilir parçalara bölünmelidir."]], mission: "Bu hafta planındaki en az bir küçük görevi zamanında tamamla." },
  2: { icon: "🛡️", title: "Dikkat Kalkanı Atölyesi", instruction: "Her duruma en uygun dikkat koruma kararını ver.", categories: ["Uzaklaştır", "Azalt", "Sorun değil"], items: [["Masada bildirimleri açık telefon", "Uzaklaştır", "Telefonu görüş alanından çıkarmak güçlü bir önlemdir."], ["Yan odadan gelen konuşma sesi", "Azalt", "Kapıyı kapatmak veya sakin alan seçmek yardımcı olabilir."], ["Çözeceğin test ve kalemin masada olması", "Sorun değil", "Görev için gerekli malzemeler dikkat dağıtıcı değildir."]], mission: "Dört çalışma oturumunda telefonunu görüş alanından çıkar." },
  3: { icon: "🧠", title: "Tekrar Dedektifi", instruction: "Tekrar yöntemlerinin etkili olup olmadığına karar ver.", categories: ["Etkili", "Geliştir"], items: [["Notu kapatıp konuyu kendi cümlelerinle anlatmak", "Etkili", "Hatırlamaya çalışmak öğrenmeyi güçlendirir."], ["Aynı sayfayı arka arkaya beş kez okumak", "Geliştir", "Sadece okumak yerine kendini sınamayı eklemelisin."], ["Konuyu farklı günlerde kısa sürelerle tekrar etmek", "Etkili", "Aralıklı tekrar unutmayı azaltır."]], mission: "Bir konuyu ertesi gün, üçüncü gün ve yedinci gün tekrar et." },
  4: { icon: "✍️", title: "Not Kalitesi Kontrolü", instruction: "Not parçalarını değerlendir.", categories: ["İyi not", "Gereksiz", "Eksik"], items: [["Fiil: İş, oluş veya hareket bildiren sözcük", "İyi not", "Kısa tanım ve anahtar kavram içeriyor."], ["Kitaptaki paragrafın tamamını aynen yazmak", "Gereksiz", "Seçmeden kopyalamak anlamayı zorlaştırır."], ["Yalnızca konu başlığını yazmak", "Eksik", "Başlık tek başına tekrar için yeterli değildir."]], mission: "Bir ders notunu anahtar kelime, açıklama ve örnekle yeniden düzenle." },
  5: { icon: "🔎", title: "Metin Haritası", instruction: "“Düzenli uyku öğrenmeyi destekler. Öğrenciler uyku saatlerine dikkat etmelidir.” metnindeki parçaları sınıflandır.", categories: ["Konu", "Ana fikir", "Ayrıntı"], items: [["Uyku ve öğrenme", "Konu", "Metnin genel olarak neden söz ettiğini gösterir."], ["Düzenli uyku öğrenmeyi desteklediği için uyku düzenine dikkat edilmelidir.", "Ana fikir", "Metnin temel mesajıdır."], ["Öğrencilerin uyku saatleri", "Ayrıntı", "Metinde geçen özel bir noktadır."]], mission: "Üç kısa metinde konu, ana fikir ve önemli ayrıntıyı belirle." },
  6: { icon: "🧭", title: "Hata Türü Avı", instruction: "Her yanlışın olası nedenini bul.", categories: ["Konu", "Dikkat", "İşlem", "Zaman"], items: [["Formülü hiç hatırlamadım.", "Konu", "Bilgi veya kavram eksikliği bulunuyor."], ["Soru “değildir” diyordu, fark etmedim.", "Dikkat", "Soru kökü yeterince dikkatli okunmamış."], ["7 × 8 işlemini 54 buldum.", "İşlem", "Çözüm bilinse de hesaplama hatası yapılmış."]], mission: "Beş yanlışını nedenlerine göre işaretle ve çözüm yaz." },
  7: { icon: "📊", title: "Deneme Karar Merkezi", instruction: "Sonuçlardan çıkarılabilecek en doğru kararı seç.", categories: ["Güçlü yön", "Öncelik", "İzle"], items: [["Türkçe 18 doğru, 2 yanlış", "Güçlü yön", "Yüksek doğruluk sürdürülebilecek bir güçlü yöndür."], ["Matematikte aynı konudan 5 yanlış", "Öncelik", "Tekrarlanan konu eksiği öncelik olmalıdır."], ["Bir soruda işlem hatası", "İzle", "Tek hata hemen büyük bir konu eksiği anlamına gelmez."]], mission: "Son denemendeki yanlışları konu, dikkat ve zaman başlıklarıyla incele." },
  8: { icon: "🌤️", title: "Düşünce Dönüştürücü", instruction: "Sınav anındaki düşünceleri etkilerine göre ayır.", categories: ["Destekler", "Kaygıyı artırır"], items: [["Heyecanlı olsam da bildiğim sorulardan başlayabilirim.", "Destekler", "Kontrol edebileceğin bir adıma odaklanır."], ["Bir soruyu yapamazsam sınav tamamen kötü geçer.", "Kaygıyı artırır", "Tek bir durumu bütün sınava geneller."], ["Nefesimi yavaşlatıp soruyu yeniden okuyabilirim.", "Destekler", "Uygulanabilir bir sakinleşme adımı içerir."]], mission: "Deneme öncesinde yavaş nefes al ve destekleyici cümleni kullan." },
  9: { icon: "⏳", title: "Zaman Bütçesi", instruction: "Günlük etkinlikleri doğru zaman grubuna yerleştir.", categories: ["Zorunlu", "Ders", "Dinlenme", "Eğlence"], items: [["Okul ve yemek saatleri", "Zorunlu", "Önceden belli olan temel zamanlardır."], ["25 dakika problem çözme", "Ders", "Açık görev ve süre içeren çalışma zamanıdır."], ["10 dakika yürüyüş", "Dinlenme", "Zihnin ve bedenin toparlanmasına yardım eder."]], mission: "Üç gün boyunca ders, dinlenme ve eğlence sürelerini not et." },
  10: { icon: "🏆", title: "Hedef Netleştirici", instruction: "Hedeflerin ölçülebilir olup olmadığına karar ver.", categories: ["Net hedef", "Belirsiz", "Küçült"], items: [["Bu hafta dört gün 15 paragraf sorusu çözeceğim.", "Net hedef", "Sayı ve zaman açıkça belirtilmiş."], ["Derslerimde daha iyi olacağım.", "Belirsiz", "Neyin ve nasıl ölçüleceği belli değil."], ["Bu ay bütün eksiklerimi tamamen bitireceğim.", "Küçült", "Hedef çok geniş; konu ve günlük adım seçilmelidir."]], mission: "Bir haftalık hedef belirle ve hafta sonunda sonucunu değerlendir." }
};

const BADGES = [
  ["İlk Adım", "İlk modülünü tamamladığında açılır.", "🌱", completed => completed.length >= 1],
  ["Plan Ustası", "Plan yapma modülünü tamamladığında açılır.", "🗓️", completed => completed.includes(1)],
  ["Dikkat Koruyucusu", "Dikkat modülünü tamamladığında açılır.", "🛡️", completed => completed.includes(2)],
  ["Tekrar Kahramanı", "Etkili tekrar modülünü tamamladığında açılır.", "🔁", completed => completed.includes(3)],
  ["Not Uzmanı", "Not tutma modülünü tamamladığında açılır.", "✍️", completed => completed.includes(4)],
  ["Anlama Dedektifi", "Okuduğunu anlama modülünü tamamladığında açılır.", "🔎", completed => completed.includes(5)],
  ["Hata Avcısı", "Hata analizi modülünü tamamladığında açılır.", "🧭", completed => completed.includes(6)],
  ["Deneme Analisti", "Deneme analizi modülünü tamamladığında açılır.", "📊", completed => completed.includes(7)],
  ["Kaygı Savaşçısı", "Sınav kaygısı modülünü tamamladığında açılır.", "🌤️", completed => completed.includes(8)],
  ["Zaman Yöneticisi", "Zaman yönetimi modülünü tamamladığında açılır.", "⏳", completed => completed.includes(9)],
  ["Hedef Şampiyonu", "Hedef modülünü tamamladığında açılır.", "🏆", completed => completed.includes(10)],
  ["10'da 10", "Tüm modülleri tamamladığında açılır.", "⭐", completed => completed.length === 10]
];

const state = {
  page: "home",
  activeModule: null,
  settings: loadData(STORAGE_KEYS.settings, { studentName: "", dailyGoal: 30, theme: "blue" }),
  answers: loadData(STORAGE_KEYS.answers, {}),
  checks: loadData(STORAGE_KEYS.checks, {}),
  completed: loadData(STORAGE_KEYS.completed, {}),
  plan: loadData(STORAGE_KEYS.plan, createEmptyPlan()),
  quizzes: loadData(STORAGE_KEYS.quizzes, {}),
  activities: loadData(STORAGE_KEYS.activities, {})
};

cloudSession = loadData(STORAGE_KEYS.cloudSession, null);

const main = document.querySelector("#main-content");
const pageTitle = document.querySelector("#page-title");
const studentChipName = document.querySelector("#student-chip-name");
const gateway = document.querySelector("#access-gateway");
const studentApp = document.querySelector("#student-app");
const studentMobileNav = document.querySelector("#student-mobile-nav");
const teacherApp = document.querySelector("#teacher-app");
const teacherContent = document.querySelector("#teacher-content");
let toastTimer;

function loadData(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch (error) {
    console.warn("Kayıtlı veri okunamadı:", key, error);
    return fallback;
  }
}

function saveData(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (key !== STORAGE_KEYS.cloudSession && cloudSession?.role === "student") scheduleStudentSync();
    return true;
  } catch (error) {
    showToast("Bilgiler bu tarayıcıya kaydedilemedi. Depolama iznini kontrol edebilirsin.", "error");
    return false;
  }
}

function createEmptyPlan() {
  return DAYS.map(day => ({ day, subject: "", topic: "", duration: "", done: false, note: "" }));
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, type = "success") {
  const toast = document.querySelector("#toast");
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  toastTimer = setTimeout(() => { toast.className = "toast"; }, 3600);
}

function getCompletedIds() {
  return Object.keys(state.completed).map(Number).filter(id => state.completed[id]);
}

function getNextModule() {
  return MODULES.find(module => !state.completed[module.id]) || MODULES[MODULES.length - 1];
}

function getLastCompletedModule() {
  const records = Object.entries(state.completed).filter(([, value]) => value && value.completedAt);
  if (!records.length) return null;
  records.sort((a, b) => new Date(b[1].completedAt) - new Date(a[1].completedAt));
  return MODULES.find(module => module.id === Number(records[0][0])) || null;
}

function getLastAnsweredModule() {
  const entries = Object.entries(state.answers).filter(([, value]) => value && value.savedAt);
  if (!entries.length) return null;
  entries.sort((a, b) => new Date(b[1].savedAt) - new Date(a[1].savedAt));
  return { module: MODULES.find(item => item.id === Number(entries[0][0])), record: entries[0][1] };
}

function getPlanStats() {
  const planned = state.plan.filter(item => item.subject.trim() || item.topic.trim() || String(item.duration).trim());
  const completed = planned.filter(item => item.done);
  const minutes = planned.reduce((sum, item) => sum + (Number(item.duration) || 0), 0);
  return { planned: planned.length, completed: completed.length, minutes, percent: planned.length ? Math.round((completed.length / planned.length) * 100) : 0 };
}

function getModuleStatus(moduleId) {
  if (state.completed[moduleId]) return { label: "✓ Tamamlandı", className: "completed" };
  const hasAnswer = state.answers[moduleId]?.values && Object.values(state.answers[moduleId].values).some(value => String(value).trim());
  const hasCheck = state.checks[moduleId]?.some(Boolean);
  const hasQuiz = Number.isInteger(state.quizzes[moduleId]?.selected);
  const hasActivity = state.activities[moduleId] && Object.keys(state.activities[moduleId]).length > 0;
  if (hasAnswer || hasCheck || hasQuiz || hasActivity) return { label: "Devam Ediyor", className: "progress" };
  return { label: "Başlanmadı", className: "" };
}

function formatDate(iso) {
  if (!iso) return "Henüz yok";
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
}

function navigate(page, options = {}) {
  state.page = page;
  state.activeModule = options.moduleId || null;
  document.querySelectorAll("[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });
  renderCurrentPage();
  window.scrollTo({ top: 0, behavior: "smooth" });
  setTimeout(() => main.focus({ preventScroll: true }), 50);
}

function showWorkspace(name) {
  gateway.classList.toggle("is-hidden", name !== "gateway");
  studentApp.classList.toggle("is-hidden", name !== "student");
  studentMobileNav.classList.toggle("is-hidden", name !== "student");
  teacherApp.classList.toggle("is-hidden", name !== "teacher");
}

function setLoginMessage(id, message, type = "error") {
  const element = document.querySelector(`#${id}`);
  if (!element) return;
  element.textContent = message;
  element.className = `login-message ${message ? `show ${type}` : ""}`;
}

function setFormBusy(form, busy, label) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.originalText) button.dataset.originalText = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy ? `<span class="button-spinner"></span>${label}` : button.dataset.originalText;
}

function buildStudentPayload() {
  return {
    version: 1,
    settings: state.settings,
    answers: state.answers,
    checks: state.checks,
    completed: state.completed,
    plan: state.plan,
    quizzes: state.quizzes,
    activities: state.activities
  };
}

function persistStudentStateLocally() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
  localStorage.setItem(STORAGE_KEYS.answers, JSON.stringify(state.answers));
  localStorage.setItem(STORAGE_KEYS.checks, JSON.stringify(state.checks));
  localStorage.setItem(STORAGE_KEYS.completed, JSON.stringify(state.completed));
  localStorage.setItem(STORAGE_KEYS.plan, JSON.stringify(state.plan));
  localStorage.setItem(STORAGE_KEYS.quizzes, JSON.stringify(state.quizzes));
  localStorage.setItem(STORAGE_KEYS.activities, JSON.stringify(state.activities));
}

function applyRemotePayload(payload, studentName, keepLocalWhenRemoteEmpty = false) {
  const hasRemoteWork = payload && typeof payload === "object" && Object.keys(payload).some(key => key !== "version");
  if (hasRemoteWork) {
    state.settings = { studentName: "", dailyGoal: 30, theme: "blue", ...(payload.settings || {}) };
    state.answers = payload.answers || {};
    state.checks = payload.checks || {};
    state.completed = payload.completed || {};
    state.plan = Array.isArray(payload.plan) && payload.plan.length === 7 ? payload.plan : createEmptyPlan();
    state.quizzes = payload.quizzes || {};
    state.activities = payload.activities || {};
  } else if (!keepLocalWhenRemoteEmpty) {
    state.settings = { studentName: "", dailyGoal: 30, theme: "blue" };
    state.answers = {};
    state.checks = {};
    state.completed = {};
    state.plan = createEmptyPlan();
    state.quizzes = {};
    state.activities = {};
  }
  state.settings.studentName = studentName || state.settings.studentName;
  persistStudentStateLocally();
  return hasRemoteWork;
}

function updateCloudStatus(status, label) {
  const element = document.querySelector("#cloud-sync-status");
  if (!element) return;
  element.className = `cloud-sync-status ${status}`;
  const text = element.querySelector("span");
  if (text) text.textContent = label;
}

function scheduleStudentSync() {
  if (!cloudClient || cloudSession?.role !== "student") return;
  clearTimeout(cloudSyncTimer);
  updateCloudStatus("syncing", "Kaydediliyor…");
  cloudSyncTimer = setTimeout(synchronizeStudent, 700);
}

async function synchronizeStudent() {
  if (!cloudClient || cloudSession?.role !== "student") return;
  if (!navigator.onLine) {
    updateCloudStatus("offline", "Çevrim dışı");
    return;
  }
  const { error } = await cloudClient.rpc("student_sync", {
    p_class_code: cloudSession.classCode,
    p_student_code: cloudSession.studentCode,
    p_payload: buildStudentPayload(),
    p_completed_count: getCompletedIds().length,
    p_plan_percent: getPlanStats().percent
  });
  if (error) {
    console.warn("Çevrim içi kayıt yapılamadı:", error.message);
    updateCloudStatus("offline", "Yerel kaydedildi");
    return;
  }
  updateCloudStatus("online", "Tüm değişiklikler kaydedildi");
}

async function handleStudentLogin(form) {
  const studentName = form.elements.studentName.value.trim();
  const classCode = form.elements.classCode.value.trim().toUpperCase();
  const studentCode = form.elements.studentCode.value.trim().toUpperCase();
  setLoginMessage("student-login-message", "");
  if (!studentName || classCode.length < 6 || studentCode.length < 6) {
    setLoginMessage("student-login-message", "Adını ve öğretmeninin verdiği iki kodu eksiksiz yazabilir misin?");
    return;
  }
  if (!cloudClient) {
    setLoginMessage("student-login-message", "Çevrim içi sistem henüz yapılandırılmadı. Öğretmeninden yardım isteyebilirsin.");
    return;
  }
  setFormBusy(form, true, "Giriş kontrol ediliyor…");
  const { data, error } = await cloudClient.rpc("student_login", {
    p_class_code: classCode,
    p_student_code: studentCode,
    p_name: studentName
  });
  setFormBusy(form, false);
  if (error || !data) {
    setLoginMessage("student-login-message", "Bilgiler eşleşmedi. Kodlarını öğretmeninle birlikte kontrol edebilirsin.");
    return;
  }
  const sameStudent = cloudSession?.role === "student" && cloudSession.studentId === data.studentId;
  cloudSession = { role: "student", classCode, studentCode, studentId: data.studentId, studentName: data.studentName, className: data.className };
  localStorage.setItem(STORAGE_KEYS.cloudSession, JSON.stringify(cloudSession));
  const remoteLoaded = applyRemotePayload(data.payload, data.studentName, sameStudent);
  showWorkspace("student");
  state.page = "home";
  renderCurrentPage();
  updateCloudStatus("online", "Tüm değişiklikler kaydedildi");
  if (!remoteLoaded) scheduleStudentSync();
  showToast(`Hoş geldin ${data.studentName}! Çalışmaların artık öğretmeninle eş zamanlanıyor. 🌟`);
}

async function handleTeacherLogin(form) {
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  setLoginMessage("teacher-login-message", "");
  if (!email || !password) {
    setLoginMessage("teacher-login-message", "E-posta adresinizi ve şifrenizi yazın.");
    return;
  }
  if (!cloudClient) {
    setLoginMessage("teacher-login-message", "Çevrim içi sistem henüz yapılandırılmadı.");
    return;
  }
  setFormBusy(form, true, "Panel hazırlanıyor…");
  const { data, error } = await cloudClient.auth.signInWithPassword({ email, password });
  setFormBusy(form, false);
  if (error || !data.session) {
    setLoginMessage("teacher-login-message", "Giriş yapılamadı. E-posta ve şifrenizi kontrol edin.");
    return;
  }
  cloudSession = { role: "teacher", email };
  localStorage.setItem(STORAGE_KEYS.cloudSession, JSON.stringify(cloudSession));
  showWorkspace("teacher");
  await loadTeacherData();
}

async function initializeApplication() {
  showWorkspace("gateway");
  if (!isCloudConfigured) {
    const setup = document.querySelector("#cloud-setup-message");
    setup.hidden = false;
    setup.innerHTML = "<strong>Kurulum tamamlanmayı bekliyor.</strong><span>Supabase proje bilgileri eklendiğinde öğrenci ve öğretmen girişleri açılacak.</span>";
    document.querySelectorAll(".login-submit").forEach(button => { button.disabled = true; });
    return;
  }

  if (cloudSession?.role === "student") {
    if (!navigator.onLine) {
      showWorkspace("student");
      renderCurrentPage();
      updateCloudStatus("offline", "Çevrim dışı • yerel kayıt");
      return;
    }
    const { data, error } = await cloudClient.rpc("student_login", {
      p_class_code: cloudSession.classCode,
      p_student_code: cloudSession.studentCode,
      p_name: cloudSession.studentName || ""
    });
    if (!error && data) {
      applyRemotePayload(data.payload, data.studentName, true);
      showWorkspace("student");
      renderCurrentPage();
      updateCloudStatus("online", "Tüm değişiklikler kaydedildi");
      return;
    }
    localStorage.removeItem(STORAGE_KEYS.cloudSession);
    cloudSession = null;
  }

  const { data } = await cloudClient.auth.getSession();
  if (data.session && cloudSession?.role === "teacher") {
    showWorkspace("teacher");
    await loadTeacherData();
  }
}

function renderCurrentPage() {
  const titles = { home: "Ana Sayfa", modules: "Modüller", plan: "Haftalık Planım", report: "Gelişim Raporum", badges: "Başarı Rozetlerim", tips: "Öğretmen Tavsiyeleri", settings: "Ayarlar" };
  pageTitle.textContent = state.activeModule ? `${state.activeModule}. Hafta` : titles[state.page];
  studentChipName.textContent = state.settings.studentName.trim() || "Öğrenci";
  applyTheme();

  if (state.page === "modules" && state.activeModule) renderModuleDetail(state.activeModule);
  else if (state.page === "home") renderHome();
  else if (state.page === "modules") renderModules();
  else if (state.page === "plan") renderPlan();
  else if (state.page === "report") renderReport();
  else if (state.page === "badges") renderBadges();
  else if (state.page === "tips") renderTips();
  else if (state.page === "settings") renderSettings();
}

function renderHome() {
  const completedIds = getCompletedIds();
  const nextModule = getNextModule();
  const lastCompleted = getLastCompletedModule();
  const planStats = getPlanStats();
  const overall = completedIds.length * 10;
  const tip = TEACHER_TIPS[new Date().getDate() % TEACHER_TIPS.length];
  const name = state.settings.studentName.trim();
  const unlockedBadges = BADGES.filter(item => item[3](completedIds)).length;
  const academyScore = Math.round((overall * 0.7) + (planStats.percent * 0.3));
  const recentActivity = Object.entries(state.completed)
    .filter(([, value]) => value?.completedAt)
    .sort((a, b) => new Date(b[1].completedAt) - new Date(a[1].completedAt))
    .slice(0, 3)
    .map(([id, value]) => ({ module: MODULES.find(item => item.id === Number(id)), date: value.completedAt }));

  main.innerHTML = `
    <section class="hero">
      <div class="hero-copy">
        <div class="hero-label"><span>●</span> KİŞİSEL ÖĞRENME ALANIN</div>
        <p class="hero-kicker">${name ? `Merhaba ${escapeHTML(name)}! 👋` : "Akademiye hoş geldin! 👋"}</p>
        <h2>Daha çok değil,<br><em>daha akıllı</em> çalış.</h2>
        <p>Her hafta bir çalışma becerisi kazan, öğrendiğini hemen uygula ve gelişimini somut olarak gör. Küçük adımlar zamanla güçlü bir çalışma düzenine dönüşür.</p>
        <div class="hero-actions">
          <button class="button hero-button" type="button" data-action="open-module" data-module-id="${nextModule.id}">${completedIds.length ? "Kaldığın Yerden Devam Et" : "Modüllere Başla"} <span>→</span></button>
          <button class="button hero-ghost" type="button" data-page="plan">Haftalık Planım</button>
        </div>
        <div class="hero-trust"><span>✓ Cihazında güvenle saklanır</span><span>✓ Kendi hızında ilerlersin</span></div>
      </div>
      <div class="hero-visual">
        <div class="score-card">
          <div class="score-card-top"><span>Akademi puanın</span><span class="live-dot">GÜNCEL</span></div>
          <div class="score-ring" style="--score:${academyScore * 3.6}deg"><div><strong>${academyScore}</strong><small>/ 100</small></div></div>
          <div class="score-details"><span><b>${completedIds.length}</b> modül</span><span><b>${unlockedBadges}</b> rozet</span><span><b>%${planStats.percent}</b> plan</span></div>
        </div>
      </div>
    </section>

    <div class="stats-grid">
      ${statCard("✅", "Tamamlanan modül", `${completedIds.length} / 10`, completedIds.length ? "Harika, ilerliyorsun!" : "İlk adımını bekliyor.")}
      ${statCard("📌", "Bu haftaki modül", `${nextModule.id}. Hafta`, nextModule.title)}
      ${statCard("📝", "Son tamamlanan görev", lastCompleted ? lastCompleted.title : "Henüz yok", lastCompleted ? formatDate(state.completed[lastCompleted.id].completedAt) : "İlk görevini tamamlayınca burada görünür.", true)}
      ${statCard("⏱️", "Günlük çalışma hedefi", `${Number(state.settings.dailyGoal) || 30} dakika`, "Küçük ve düzenli adımlar.")}
      ${statCard("💡", "Öğretmen tavsiyesi", tip, "Bugünün küçük hatırlatması.", true)}
      ${statCard("📈", "Genel ilerleme", `%${overall}`, overall === 100 ? "10'da 10! Muhteşem." : "Her modül %10 kazandırır.")}
    </div>

    <section class="academy-pulse">
      <div class="pulse-heading"><div><span class="section-tag">BU HAFTA</span><h3>Çalışma nabzın</h3><p>Planındaki küçük adımların haftaya nasıl dağıldığını gör.</p></div><button class="button ghost small" type="button" data-page="plan">Planı düzenle →</button></div>
      <div class="week-strip">
        ${state.plan.map(item => {
          const planned = item.subject.trim() || item.topic.trim() || String(item.duration).trim();
          return `<div class="day-pulse ${item.done ? "done" : planned ? "planned" : ""}"><span>${item.day.slice(0, 3)}</span><b>${item.done ? "✓" : planned ? item.duration || "•" : "–"}</b><small>${item.done ? "Tamam" : planned ? "dk." : "Boş"}</small></div>`;
        }).join("")}
      </div>
    </section>

    <div class="dashboard-grid">
      <section class="panel">
        <div class="panel-header"><div><span class="section-tag">SIRADAKİ ADIM</span><h3>Akademi yolculuğun</h3><p>Her tamamlanan modül seni hedefe biraz daha yaklaştırır.</p></div><strong class="big-percent">%${overall}</strong></div>
        <div class="progress-track" aria-label="Genel ilerleme yüzde ${overall}"><div class="progress-fill" style="width:${overall}%"></div></div>
        <div class="next-module">
          <div class="next-module-icon">${nextModule.icon}</div>
          <div class="next-module-copy"><small>${completedIds.length === 10 ? "Tekrar etmek ister misin?" : `${MODULE_EXTRAS[nextModule.id].duration} • Uygulamalı modül`}</small><strong>${nextModule.id}. Hafta: ${nextModule.title}</strong></div>
          <button class="button primary small" type="button" data-action="open-module" data-module-id="${nextModule.id}">Aç</button>
        </div>
      </section>
      <section class="panel">
        <div class="panel-header"><div><h3>Hızlı ulaş</h3><p>İhtiyacın olan bölüme geç.</p></div></div>
        <div class="quick-actions">
          <button class="quick-action" type="button" data-page="modules"><span>📚</span><strong>10 Modül</strong><small>Becerileri keşfet</small></button>
          <button class="quick-action" type="button" data-page="plan"><span>🗓️</span><strong>Planım</strong><small>%${planStats.percent} tamamlandı</small></button>
          <button class="quick-action" type="button" data-page="report"><span>📈</span><strong>Raporum</strong><small>Öğretmenle paylaş</small></button>
          <button class="quick-action" type="button" data-page="badges"><span>🏅</span><strong>Rozetler</strong><small>${unlockedBadges} rozet açık</small></button>
        </div>
      </section>
    </div>

    <section class="skill-map-section">
      <div class="section-heading"><div><span class="section-tag">BECERİ HARİTASI</span><h2>10 haftalık gelişim rotan</h2><p>Tamamlanan beceriler renklenir. Sıradaki adımın halkayla gösterilir.</p></div><button class="button secondary small" type="button" data-page="modules">Tüm modülleri gör</button></div>
      <div class="skill-map">
        ${MODULES.map(module => `<button type="button" class="skill-node ${state.completed[module.id] ? "completed" : module.id === nextModule.id ? "current" : ""}" data-action="open-module" data-module-id="${module.id}"><span>${state.completed[module.id] ? "✓" : module.icon}</span><small>${module.id}. Hafta</small><b>${module.title.replace("?", "")}</b></button>`).join("")}
      </div>
    </section>

    <div class="dashboard-grid lower-grid">
      <section class="panel activity-panel">
        <div class="panel-header"><div><span class="section-tag">SON HAREKETLER</span><h3>Gelişim günlüğün</h3></div></div>
        ${recentActivity.length ? `<div class="activity-list">${recentActivity.map(item => `<div class="activity-item"><span class="activity-icon">${item.module.icon}</span><div><strong>${item.module.title}</strong><small>${formatDate(item.date)} tarihinde tamamlandı</small></div><span class="activity-check">✓</span></div>`).join("")}</div>` : `<div class="empty-state compact"><span>🌱</span>İlk modülünü tamamladığında gelişim günlüğün burada başlayacak.</div>`}
      </section>
      <section class="panel coach-card"><span class="coach-avatar">🧑‍🏫</span><div><span class="section-tag">ÖĞRETMEN NOTU</span><h3>Bugünün küçük hatırlatması</h3><blockquote>“${tip}”</blockquote><button class="text-button" type="button" data-page="tips">Diğer tavsiyeleri gör →</button></div></section>
    </div>`;
}

function statCard(icon, label, value, note, textValue = false) {
  return `<article class="stat-card"><span class="stat-icon">${icon}</span><span class="stat-label">${label}</span><strong class="stat-value${textValue ? " text" : ""}">${escapeHTML(value)}</strong><span class="stat-note">${escapeHTML(note)}</span></article>`;
}

function renderModules() {
  const completed = getCompletedIds().length;
  main.innerHTML = `
    <section class="page-intro"><div><h2>10 haftada 10 güçlü beceri</h2><p>Modülleri sırayla ilerletebilir ya da bugün en çok ihtiyacın olan konuyu seçebilirsin. Her görev küçük bir adım olarak tasarlandı.</p></div><div class="intro-icon" aria-hidden="true">📚</div></section>
    <div class="progress-line"><span>Akademi ilerlemen</span><strong>${completed} / 10 modül</strong></div>
    <div class="progress-track" aria-label="Modüllerin yüzde ${completed * 10} kadarı tamamlandı"><div class="progress-fill" style="width:${completed * 10}%"></div></div>
    <div class="section-heading"><div><h2>Tüm modüller</h2><p>Bir kart seç ve kendi hızında ilerle.</p></div></div>
    <div class="module-grid">
      ${MODULES.map(module => {
        const status = getModuleStatus(module.id);
        return `<article class="module-card module-accent-${((module.id - 1) % 5) + 1} ${status.className === "completed" ? "completed" : ""}">
          <div class="module-card-top"><span class="module-number">${status.className === "completed" ? "✓" : module.id}</span><span class="status-pill ${status.className}">${status.label}</span></div>
          <div class="module-card-meta"><span>${module.icon} ${MODULE_EXTRAS[module.id].duration}</span><span>5 bölüm</span></div>
          <h3>${module.title}</h3><p>${module.short}</p>
          <div class="module-mini-progress"><span><i style="width:${status.className === "completed" ? 100 : status.className === "progress" ? 45 : 8}%"></i></span><small>${status.className === "completed" ? "Tamamlandı" : status.className === "progress" ? "Çalışma sürüyor" : "Başlamaya hazır"}</small></div>
          <button class="button ${status.className === "completed" ? "secondary" : "primary"}" type="button" data-action="open-module" data-module-id="${module.id}">${status.className === "completed" ? "Yeniden İncele" : "Modülü Aç"} <span>→</span></button>
        </article>`;
      }).join("")}
    </div>`;
}

function renderModuleDetail(moduleId) {
  const module = MODULES.find(item => item.id === Number(moduleId));
  if (!module) return navigate("modules");
  const extra = MODULE_EXTRAS[module.id];
  const answerRecord = state.answers[module.id]?.values || {};
  const savedChecks = state.checks[module.id] || [];
  const quizRecord = state.quizzes[module.id];
  const activityRecord = state.activities[module.id] || {};
  const status = getModuleStatus(module.id);
  const checkedCount = savedChecks.filter(Boolean).length;
  const filledCount = module.fields.filter(field => String(answerRecord[field[0]] || "").trim()).length;
  const quizPoint = Number.isInteger(quizRecord?.selected) ? 1 : 0;
  const labPoint = state.completed[module.id] || Object.keys(activityRecord.choices || {}).length === ACTIVITY_LABS[module.id].items.length ? 1 : 0;
  const progress = Math.round(((checkedCount + filledCount + quizPoint + labPoint) / (module.checks.length + module.fields.length + 2)) * 100);

  main.innerHTML = `<article class="module-detail">
    <button class="button ghost small back-button" type="button" data-action="back-modules">← Tüm modüller</button>
    <header class="module-banner module-accent-${((module.id - 1) % 5) + 1}">
      <div class="module-banner-top"><div><p class="module-banner-kicker">${module.id}. HAFTA • ${module.icon} ÇALIŞMA BECERİSİ</p><h2>${module.title}</h2></div><span class="status-pill">${status.label}</span></div>
      <div class="module-banner-meta"><span>◷ ${extra.duration}</span><span>▤ 5 öğrenme bölümü</span><span>✦ Uygulamalı görev</span></div>
      <div class="module-progress"><div class="progress-line"><span>Bu modüldeki ilerlemen</span><strong>%${progress}</strong></div><div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div></div>
    </header>

    <nav class="learning-route" aria-label="Modül öğrenme rotası">
      ${[["1", "Keşfet"], ["2", "Öğren"], ["3", "Örneği gör"], ["4", "Kendini sına"], ["5", "Uygula"]].map((step, index) => `<div class="route-step"><span>${step[0]}</span><b>${step[1]}</b>${index < 4 ? "<i></i>" : ""}</div>`).join("")}
    </nav>

    <section class="warmup-card"><div class="warmup-icon">💭</div><div><span class="section-tag">BAŞLAMADAN DÜŞÜN</span><h3>Kendine kısa bir soru sor</h3><p>${extra.warmup}</p><small>Cevabını zihninden geçirmen yeterli. Burada doğru veya yanlış yok.</small></div></section>

    <section class="content-section"><h3><span>👋</span> Neden önemli?</h3><p>${module.description}</p></section>
    <section class="content-section goal-box"><h3><span>🎯</span> Öğrenme hedefin</h3><p>${module.goal}</p></section>
    <section class="content-section"><h3><span>🧑‍🏫</span> Birlikte öğrenelim</h3><p>Bu beceriyi uygularken şu üç noktayı aklında tut:</p><div class="lesson-points">${module.lesson.map(point => `<div class="lesson-point"><span>${point[0]}</span><strong>${point[1]}</strong><p>${point[2]}</p></div>`).join("")}</div></section>
    <section class="content-section method-section"><div class="section-number">02</div><div class="section-copy"><span class="section-tag">UYGULAMA YÖNTEMİ</span><h3><span>🪜</span> Bu beceriyi 4 adımda kullan</h3><div class="method-steps">${extra.steps.map((step, index) => `<div class="method-step"><span>${index + 1}</span><p>${step}</p></div>`).join("")}</div></div></section>
    <section class="content-section story-box"><h3><span>🎬</span> Günlük hayattan bir örnek</h3><p>${module.story}</p></section>
    <div class="insight-grid">
      <section class="insight-card power"><span class="insight-icon">⚡</span><div><span class="section-tag">GÜÇLÜ İPUCU</span><h3>Bunu dene</h3><p>${extra.powerTip}</p></div></section>
      <section class="insight-card caution"><span class="insight-icon">⚠️</span><div><span class="section-tag">SIK YAPILAN HATA</span><h3>Buna dikkat et</h3><p>${extra.commonMistake}</p></div></section>
    </div>
    ${renderInteractiveLab(module.id)}
    ${renderModuleQuiz(module.id)}
    <section class="content-section task-box"><h3><span>🧩</span> Küçük uygulaman</h3><p>${module.task}</p></section>

    <form class="module-form" id="module-form" data-module-id="${module.id}" novalidate>
      <section class="content-section"><h3><span>✏️</span> Kendi cevabım</h3><p style="color:var(--muted);margin-bottom:20px">Kendi düşüncelerini yaz. Doğru ya da yanlış cevap yok; bu alan sana ait.</p>
        ${module.fields.map(field => renderField(field, answerRecord[field[0]])).join("")}
      </section>
      <section class="content-section"><h3><span>✅</span> Kontrol listem</h3><p style="color:var(--muted);margin-bottom:18px">Hazır olduğun maddeleri işaretle.</p><div class="check-list">
        ${module.checks.map((label, index) => `<label class="check-item"><input type="checkbox" name="check-${index}" ${savedChecks[index] ? "checked" : ""}><span>${label}</span></label>`).join("")}
      </div></section>
      <div id="module-message" class="helper-message" role="alert"></div>
      <div class="form-actions"><button class="button ghost" type="button" data-action="save-draft">Taslağı Kaydet</button><button class="button primary" type="submit">${state.completed[module.id] ? "Cevaplarımı Güncelle" : "Modülü Tamamla"} ✨</button></div>
    </form>
    <nav class="module-footer-nav" aria-label="Modüller arası geçiş">
      ${module.id > 1 ? `<button class="module-jump previous" type="button" data-action="open-module" data-module-id="${module.id - 1}"><span>← Önceki modül</span><strong>${MODULES[module.id - 2].title}</strong></button>` : `<div></div>`}
      ${module.id < 10 ? `<button class="module-jump next" type="button" data-action="open-module" data-module-id="${module.id + 1}"><span>Sonraki modül →</span><strong>${MODULES[module.id].title}</strong></button>` : `<button class="module-jump next" type="button" data-page="badges"><span>Akademi sonucu →</span><strong>Rozetlerimi Gör</strong></button>`}
    </nav>
  </article>`;
}

function renderInteractiveLab(moduleId) {
  const lab = ACTIVITY_LABS[moduleId];
  const record = state.activities[moduleId] || { choices: {}, missionDays: [] };
  const choices = record.choices || {};
  const answered = Object.keys(choices).length;
  const correct = lab.items.filter((item, index) => choices[index] === item[1]).length;
  const completed = answered === lab.items.length;
  return `<section class="activity-lab" id="activity-lab-${moduleId}">
    <div class="activity-lab-header"><div class="activity-lab-icon">${lab.icon}</div><div><span class="section-tag">ETKİLEŞİMLİ BECERİ ATÖLYESİ</span><h3>${lab.title}</h3><p>${lab.instruction}</p></div><div class="lab-score"><strong>${correct}/${lab.items.length}</strong><small>${completed ? "tamamlandı" : "doğru"}</small></div></div>
    <div class="confidence-panel"><div><strong>Başlamadan önce bu konuda kendine kaç puan verirsin?</strong><small>1: Henüz emin değilim • 5: Kendime güveniyorum</small></div><div class="confidence-scale">${[1,2,3,4,5].map(value => `<button type="button" class="confidence-button ${record.confidenceBefore === value ? "active" : ""}" data-action="activity-confidence" data-stage="before" data-value="${value}" data-module-id="${moduleId}">${value}</button>`).join("")}</div></div>
    <div class="classification-list">${lab.items.map((item, index) => {
      const selected = choices[index];
      const isCorrect = selected === item[1];
      return `<article class="classification-card ${selected ? isCorrect ? "correct" : "wrong" : ""}"><div class="classification-number">${index + 1}</div><div class="classification-content"><strong>${item[0]}</strong><div class="classification-options">${lab.categories.map(category => `<button type="button" class="classification-option ${selected === category ? "selected" : ""}" data-action="activity-choice" data-module-id="${moduleId}" data-item-index="${index}" data-category="${escapeHTML(category)}">${category}</button>`).join("")}</div>${selected ? `<div class="classification-feedback"><b>${isCorrect ? "✓ Doğru karar" : `Doğru cevap: ${item[1]}`}</b><span>${item[2]}</span></div>` : ""}</div></article>`;
    }).join("")}</div>
    ${completed ? `<div class="lab-complete-banner"><span>🎉</span><div><strong>Atölyeyi tamamladın!</strong><p>${correct === lab.items.length ? "Bütün kararların doğru. Harika bir dikkat gösterdin." : "Geri bildirimlere bakarak yanlış kararlarını yeniden deneyebilirsin."}</p></div></div>` : ""}
    <div class="mission-card"><div class="mission-copy"><span class="section-tag">7 GÜNLÜK GERÇEK HAYAT GÖREVİ</span><h4>${lab.mission}</h4><p>Görevi denediğin günleri işaretle. Bir gün bile başlaman değerlidir.</p></div><div class="mission-days">${[0,1,2,3,4,5,6].map(day => `<button type="button" class="mission-day ${record.missionDays?.[day] ? "done" : ""}" data-action="activity-day" data-module-id="${moduleId}" data-day-index="${day}"><span>${day + 1}</span><small>Gün</small></button>`).join("")}</div></div>
    <div class="activity-reflection"><div class="field-group"><label for="activity-reflection-${moduleId}">Bu etkinlikten sonra fark ettiğim şey</label><textarea id="activity-reflection-${moduleId}" placeholder="Kısa bir düşünce yazabilirsin…">${escapeHTML(record.reflection || "")}</textarea></div><div><span>Etkinlikten sonra kendine verdiğin puan</span><div class="confidence-scale">${[1,2,3,4,5].map(value => `<button type="button" class="confidence-button ${record.confidenceAfter === value ? "active" : ""}" data-action="activity-confidence" data-stage="after" data-value="${value}" data-module-id="${moduleId}">${value}</button>`).join("")}</div><button class="button secondary small" type="button" data-action="save-activity-reflection" data-module-id="${moduleId}">Düşüncemi Kaydet</button></div></div>
  </section>`;
}

function renderModuleQuiz(moduleId) {
  const quiz = MODULE_EXTRAS[moduleId].quiz;
  const selected = state.quizzes[moduleId]?.selected;
  const answered = Number.isInteger(selected);
  const isCorrect = selected === quiz.answer;
  return `<section class="quiz-card" id="module-quiz-${moduleId}">
    <div class="quiz-heading"><div><span class="section-tag">MİNİ BİLGİ KONTROLÜ</span><h3>🧠 Kendini sına</h3><p>${quiz.question}</p></div><span class="quiz-badge">1 soru</span></div>
    <div class="quiz-options">${quiz.options.map((option, index) => {
      const optionClass = answered && index === quiz.answer ? "correct" : answered && index === selected ? "wrong" : "";
      return `<button class="quiz-option ${optionClass}" type="button" data-action="quiz-option" data-module-id="${moduleId}" data-option-index="${index}" aria-pressed="${selected === index}"><span>${String.fromCharCode(65 + index)}</span><b>${option}</b>${optionClass === "correct" ? "<i>✓</i>" : optionClass === "wrong" ? "<i>×</i>" : ""}</button>`;
    }).join("")}</div>
    <div class="quiz-feedback ${answered ? `show ${isCorrect ? "success" : "retry"}` : ""}" aria-live="polite">${answered ? `<strong>${isCorrect ? "Harika, doğru düşündün!" : "Güzel bir deneme. Birlikte bakalım:"}</strong><p>${quiz.explanation}</p>` : ""}</div>
  </section>`;
}

function renderField(field, value = "") {
  const [id, label, type, placeholder, options] = field;
  const safeValue = escapeHTML(value);
  let input;
  if (type === "textarea") input = `<textarea id="${id}" name="${id}" placeholder="${escapeHTML(placeholder)}">${safeValue}</textarea>`;
  else if (type === "select") input = `<select id="${id}" name="${id}"><option value="">${escapeHTML(placeholder)}</option>${options.map(option => `<option value="${escapeHTML(option)}" ${option === value ? "selected" : ""}>${escapeHTML(option)}</option>`).join("")}</select>`;
  else input = `<input id="${id}" name="${id}" type="${type}" value="${safeValue}" placeholder="${escapeHTML(placeholder)}" ${type === "number" ? 'min="0" inputmode="numeric"' : ""}>`;
  return `<div class="field-group"><label for="${id}">${label}</label>${input}</div>`;
}

function collectModuleForm(form) {
  const module = MODULES.find(item => item.id === Number(form.dataset.moduleId));
  const values = {};
  module.fields.forEach(field => { values[field[0]] = form.elements[field[0]].value.trim(); });
  const checks = module.checks.map((_, index) => form.elements[`check-${index}`].checked);
  return { module, values, checks };
}

function saveModuleDraft(form) {
  const { module, values, checks } = collectModuleForm(form);
  const hasValue = Object.values(values).some(value => value.trim()) || checks.some(Boolean);
  if (!hasValue) {
    showModuleMessage("Önce en az bir cevap yazabilir veya bir maddeyi işaretleyebilirsin.");
    return false;
  }
  state.answers[module.id] = { values, savedAt: new Date().toISOString() };
  state.checks[module.id] = checks;
  saveData(STORAGE_KEYS.answers, state.answers);
  saveData(STORAGE_KEYS.checks, state.checks);
  showModuleMessage("");
  return true;
}

function completeModule(form) {
  const { module, values, checks } = collectModuleForm(form);
  const emptyField = module.fields.find(field => !values[field[0]]);
  if (emptyField) {
    showModuleMessage(`“${emptyField[1]}” alanına kısa bir cevap ekleyebilir misin?`);
    form.elements[emptyField[0]].focus();
    return;
  }
  if (!checks.every(Boolean)) {
    showModuleMessage("Tamamlamadan önce kontrol listendeki maddelere tekrar göz atıp hazır olanları işaretleyebilirsin.");
    return;
  }
  const labCompleted = Object.keys(state.activities[module.id]?.choices || {}).length === ACTIVITY_LABS[module.id].items.length;
  if (!state.completed[module.id] && !labCompleted) {
    showModuleMessage("Modülü tamamlamadan önce etkileşimli beceri atölyesindeki üç kararı da denemeni rica ediyorum.");
    document.querySelector(`#activity-lab-${module.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (!Number.isInteger(state.quizzes[module.id]?.selected)) {
    showModuleMessage("Modülü tamamlamadan önce mini bilgi kontrolündeki seçeneklerden birini denemeni rica ediyorum.");
    document.querySelector(`#module-quiz-${module.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  state.answers[module.id] = { values, savedAt: new Date().toISOString() };
  state.checks[module.id] = checks;
  state.completed[module.id] = { completedAt: new Date().toISOString() };
  saveData(STORAGE_KEYS.answers, state.answers);
  saveData(STORAGE_KEYS.checks, state.checks);
  saveData(STORAGE_KEYS.completed, state.completed);
  showToast(`Harika! ${module.id}. modülü tamamladın. Yeni bir rozet kazanmış olabilirsin! 🎉`);
  renderModuleDetail(module.id);
}

function showModuleMessage(message) {
  const element = document.querySelector("#module-message");
  if (!element) return;
  element.textContent = message;
  element.classList.toggle("show", Boolean(message));
}

function renderPlan() {
  const stats = getPlanStats();
  main.innerHTML = `
    <section class="page-intro"><div><h2>Haftanı küçük adımlarla planla</h2><p>Her güne yalnızca uygulayabileceğin kadar görev ekle. Planın sana yardımcı olmalı; seni yormamalı.</p></div><div class="intro-icon" aria-hidden="true">🗓️</div></section>
    <section class="plan-coach">
      <div><span class="section-tag">PLANLAMA ASİSTANI</span><h3>Dengeli bir hafta için 3 küçük kural</h3></div>
      <div class="plan-rule"><span>01</span><p><strong>Tek göreve odaklan</strong>Bir güne çok sayıda konu eklemek yerine önceliğini seç.</p></div>
      <div class="plan-rule"><span>02</span><p><strong>25 + 5 ritmi</strong>25 dakika odaklan, ardından 5 dakika kısa mola ver.</p></div>
      <div class="plan-rule"><span>03</span><p><strong>Boşluk bırak</strong>Haftanın her gününü doldurmak zorunda değilsin.</p></div>
    </section>
    <div class="plan-summary">
      <div class="mini-stat"><span>Planlanan gün</span><strong>${stats.planned} / 7</strong></div>
      <div class="mini-stat"><span>Tamamlanan görev</span><strong>${stats.completed}</strong></div>
      <div class="mini-stat"><span>Haftalık ilerleme</span><strong>%${stats.percent}</strong></div>
    </div>
    <div class="progress-line"><span>Plan tamamlanma durumu</span><strong>%${stats.percent}</strong></div><div class="progress-track" style="margin-bottom:18px"><div class="progress-fill" style="width:${stats.percent}%"></div></div>
    <form id="plan-form" novalidate>
      <div class="table-wrap"><table class="plan-table"><thead><tr><th>Gün</th><th>Çalışılacak ders</th><th>Konu</th><th>Süre (dk.)</th><th>Tamamlandı</th><th>Kısa not</th></tr></thead><tbody>
        ${state.plan.map((item, index) => `<tr class="${item.done ? "done" : ""}"><td class="day-cell">${item.day}</td><td><input aria-label="${item.day} çalışılacak ders" name="subject-${index}" value="${escapeHTML(item.subject)}" placeholder="Ders"></td><td><input aria-label="${item.day} konu" name="topic-${index}" value="${escapeHTML(item.topic)}" placeholder="Konu"></td><td><input aria-label="${item.day} süre" name="duration-${index}" type="number" min="0" inputmode="numeric" value="${escapeHTML(item.duration)}" placeholder="30"></td><td style="text-align:center"><input aria-label="${item.day} görevi tamamlandı" name="done-${index}" type="checkbox" ${item.done ? "checked" : ""}></td><td><textarea aria-label="${item.day} kısa not" name="note-${index}" placeholder="Küçük bir not">${escapeHTML(item.note)}</textarea></td></tr>`).join("")}
      </tbody></table></div>
      <div id="plan-message" class="helper-message" role="alert" style="margin-top:14px"></div>
      <div class="plan-actions"><button class="button ghost" type="button" data-action="clear-plan">Planı Temizle</button><button class="button primary" type="submit">Haftalık Planı Kaydet ✓</button></div>
    </form>`;
}

function savePlan(form) {
  const nextPlan = DAYS.map((day, index) => ({
    day,
    subject: form.elements[`subject-${index}`].value.trim(),
    topic: form.elements[`topic-${index}`].value.trim(),
    duration: form.elements[`duration-${index}`].value.trim(),
    done: form.elements[`done-${index}`].checked,
    note: form.elements[`note-${index}`].value.trim()
  }));
  const activeRows = nextPlan.filter(item => item.subject || item.topic || item.duration || item.note || item.done);
  const message = document.querySelector("#plan-message");
  if (!activeRows.length) {
    message.textContent = "Planını kaydetmek için en az bir güne ders, konu ve süre ekleyebilirsin.";
    message.classList.add("show");
    return;
  }
  const incompleteRow = activeRows.find(item => !item.subject || !item.topic || !item.duration);
  if (incompleteRow) {
    message.textContent = `${incompleteRow.day} için ders, konu ve süre alanlarını birlikte doldurabilir misin?`;
    message.classList.add("show");
    return;
  }
  state.plan = nextPlan;
  saveData(STORAGE_KEYS.plan, state.plan);
  showToast("Haftalık planın kaydedildi. Küçük adımların hazır! 🗓️");
  renderPlan();
}

function getAutomaticSuggestion() {
  const completed = getCompletedIds().length;
  const plan = getPlanStats();
  if (completed <= 2) return "Bu hafta bir modül seçip küçük bir adımla başlayabilirsin.";
  if (plan.planned === 0 || plan.percent < 50) return "Planını daha küçük parçalara bölmeyi deneyebilirsin. Uygulayabileceğin tek bir gün seçmek bile iyi bir başlangıçtır.";
  if (completed >= 7) return "Düzenli ilerliyorsun, bu alışkanlığı korumaya çalış. Dinlenmeye de zaman ayırmayı unutma.";
  return "Güzel ilerliyorsun. Bu hafta bir modülü tamamlayıp planındaki küçük adımları sürdürmeyi deneyebilirsin.";
}

function getLastAnswerText() {
  const last = getLastAnsweredModule();
  if (!last?.module) return { title: "Henüz cevap yok", text: "İlk modül uygulamanı tamamladığında cevabın burada görünecek." };
  const lines = last.module.fields
    .filter(field => last.record.values[field[0]])
    .map(field => `${field[1]} ${last.record.values[field[0]]}`);
  return { title: `${last.module.id}. Modül: ${last.module.title}`, text: lines.join("\n") };
}

function buildReportText() {
  const name = state.settings.studentName.trim() || "Belirtilmedi";
  const completed = getCompletedIds();
  const plan = getPlanStats();
  const lastCompleted = getLastCompletedModule();
  const lastAnswer = getLastAnswerText();
  const completedNames = completed.length ? completed.map(id => `${id}. ${MODULES.find(item => item.id === id).title}`).join(", ") : "Henüz tamamlanan modül yok.";
  return `VERİMLİ DERS ÇALIŞMA AKADEMİSİ\nGELİŞİM RAPORU\n\nÖğrenci: ${name}\nTarih: ${new Intl.DateTimeFormat("tr-TR").format(new Date())}\nTamamlanan modül: ${completed.length} / 10\nTamamlanan haftalık görev: ${plan.completed} / ${plan.planned}\nHaftalık plan ilerlemesi: %${plan.percent}\nEn son yapılan uygulama: ${lastCompleted ? `${lastCompleted.id}. ${lastCompleted.title}` : "Henüz yok"}\n\nTamamlanan modüller:\n${completedNames}\n\nSon cevap (${lastAnswer.title}):\n${lastAnswer.text}\n\nÖğrenciye öneri:\n${getAutomaticSuggestion()}`;
}

function renderReport() {
  const completed = getCompletedIds();
  const plan = getPlanStats();
  const lastCompleted = getLastCompletedModule();
  const lastAnswer = getLastAnswerText();
  const name = state.settings.studentName.trim() || "Öğrenci adı eklenmedi";
  main.innerHTML = `
    <section class="page-intro"><div><h2>Gelişimini görünür kıl</h2><p>Bu raporu kopyalayıp öğretmeninle paylaşabilirsin. Rapor yalnızca bu cihazdaki çalışmalarından oluşur.</p></div><div class="intro-icon" aria-hidden="true">📈</div></section>
    <article class="report-card">
      <header class="report-header"><p>VERİMLİ DERS ÇALIŞMA AKADEMİSİ</p><h2>${escapeHTML(name)} • Gelişim Raporu</h2></header>
      <div class="report-body">
        ${!state.settings.studentName.trim() ? `<div class="empty-state" style="margin-bottom:20px"><span>👤</span>Raporunda adının görünmesi için <button class="button secondary small" type="button" data-page="settings">Ayarlar'dan adını ekle</button></div>` : ""}
        <div class="report-stats"><div class="report-stat"><span>Tamamlanan modül</span><strong>${completed.length} / 10</strong></div><div class="report-stat"><span>Haftalık görev</span><strong>${plan.completed} / ${plan.planned}</strong></div><div class="report-stat"><span>Plan ilerlemesi</span><strong>%${plan.percent}</strong></div></div>
        <div class="report-row"><span>EN SON YAPILAN UYGULAMA</span><p>${lastCompleted ? `${lastCompleted.icon} ${lastCompleted.id}. ${lastCompleted.title} • ${formatDate(state.completed[lastCompleted.id].completedAt)}` : "Henüz bir modül tamamlanmadı."}</p></div>
        <div class="report-row"><span>ÖĞRENCİNİN SON CEVABI • ${escapeHTML(lastAnswer.title)}</span><p>${escapeHTML(lastAnswer.text)}</p></div>
        <div class="recommendation"><strong>💡 Sana özel küçük öneri</strong><p>${getAutomaticSuggestion()}</p></div>
        <div class="report-actions"><button class="button primary" type="button" data-action="copy-report">📋 Raporu Kopyala</button><button class="button secondary" type="button" data-action="share-whatsapp">WhatsApp ile Paylaş</button><button class="button ghost" type="button" data-action="share-email">E-posta ile Paylaş</button></div>
      </div>
    </article>`;
}

async function copyReport() {
  const text = buildReportText();
  try {
    await navigator.clipboard.writeText(text);
    showToast("Rapor kopyalandı. Şimdi öğretmenine gönderebilirsin! 📋");
  } catch (error) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    showToast(copied ? "Rapor kopyalandı! 📋" : "Rapor kopyalanamadı. Tarayıcı izinlerini kontrol edebilirsin.", copied ? "success" : "error");
  }
}

function renderBadges() {
  const completed = getCompletedIds();
  const unlockedCount = BADGES.filter(badge => badge[3](completed)).length;
  main.innerHTML = `
    <section class="page-intro"><div><h2>Her adımın bir başarı</h2><p>Modülleri tamamladıkça yeni rozetlerin açılır. Kilitli rozetler seni bekliyor; acele etmene gerek yok.</p></div><div class="intro-icon" aria-hidden="true">🏅</div></section>
    <div class="progress-line"><span>Kazanılan rozet</span><strong>${unlockedCount} / ${BADGES.length}</strong></div><div class="progress-track" style="margin-bottom:26px"><div class="progress-fill" style="width:${Math.round(unlockedCount / BADGES.length * 100)}%"></div></div>
    <div class="badge-grid">${BADGES.map(badge => { const unlocked = badge[3](completed); return `<article class="badge-card ${unlocked ? "unlocked" : ""}"><span class="lock-mark">${unlocked ? "✓" : "🔒"}</span><div class="badge-medal">${badge[2]}</div><h3>${badge[0]}</h3><p>${unlocked ? "Rozet açıldı! Harika gidiyorsun." : badge[1]}</p></article>`; }).join("")}</div>`;
}

function renderTips() {
  const icons = ["⏰", "📵", "🧭", "🔁", "🪴", "📊", "🎯", "🔦"];
  const titles = ["Rutin oluştur", "Telefonuna mola ver", "Yanlışını incele", "Kısa tekrar yap", "Gerçekçi planla", "Sonucu yol haritası yap", "Küçük hedef seç", "Tek işe odaklan"];
  main.innerHTML = `
    <section class="page-intro"><div><h2>Öğretmeninden küçük hatırlatmalar</h2><p>Hepsini bir anda uygulamana gerek yok. Bugün sana en uygun gelen bir tavsiyeyi seçmen yeterli.</p></div><div class="intro-icon" aria-hidden="true">💡</div></section>
    <div class="tips-grid">${TEACHER_TIPS.map((tip, index) => `<article class="tip-card"><div class="tip-icon">${icons[index]}</div><div><h3>${titles[index]}</h3><p>${tip}</p></div></article>`).join("")}</div>`;
}

function renderSettings() {
  const theme = state.settings.theme || "blue";
  main.innerHTML = `
    <section class="page-intro"><div><h2>Akademini kendine göre ayarla</h2><p>Adını, günlük hedefini ve sevdiğin rengi seçebilirsin. Bu bilgiler yalnızca bu tarayıcıda saklanır.</p></div><div class="intro-icon" aria-hidden="true">⚙️</div></section>
    <div class="settings-layout">
      <form class="panel settings-form" id="settings-form">
        <div class="field-group"><label for="studentName">Öğrenci adı</label><input id="studentName" name="studentName" maxlength="50" value="${escapeHTML(state.settings.studentName)}" placeholder="Adını yaz"><small>Raporunda ve karşılama alanında görünür.</small></div>
        <div class="field-group"><label for="dailyGoal">Günlük çalışma hedefi (dakika)</label><input id="dailyGoal" name="dailyGoal" type="number" min="5" max="300" value="${escapeHTML(state.settings.dailyGoal)}" inputmode="numeric"><small>5 ile 300 dakika arasında sana uygun bir hedef seç.</small></div>
        <div class="field-group"><label>Renk teması</label><div class="theme-options">
          ${[["blue", "Mavi"], ["purple", "Mor"], ["green", "Yeşil"], ["orange", "Turuncu"]].map(item => `<button class="theme-option ${theme === item[0] ? "active" : ""}" type="button" data-action="select-theme" data-theme="${item[0]}" aria-pressed="${theme === item[0]}"><span class="theme-color ${item[0]}"></span><strong>${item[1]} tema</strong></button>`).join("")}
        </div></div>
        <input type="hidden" name="theme" value="${theme}"><button class="button primary" type="submit">Ayarları Kaydet ✓</button>
      </form>
      <section class="panel danger-zone"><h3>🧹 Yeni bir başlangıç</h3><p>Tüm modül cevaplarını, tamamlanma bilgilerini, planını ve ayarlarını bu cihazdan silebilirsin. Bu işlem geri alınamaz.</p><button class="button danger" type="button" data-action="reset-data">Tüm Verileri Sıfırla</button></section>
    </div>`;
}

function saveSettings(form) {
  const dailyGoal = Number(form.elements.dailyGoal.value);
  if (!Number.isFinite(dailyGoal) || dailyGoal < 5 || dailyGoal > 300) {
    showToast("Günlük hedefini 5 ile 300 dakika arasında seçebilirsin.", "error");
    form.elements.dailyGoal.focus();
    return;
  }
  state.settings = { studentName: form.elements.studentName.value.trim(), dailyGoal, theme: form.elements.theme.value };
  saveData(STORAGE_KEYS.settings, state.settings);
  showToast("Ayarların kaydedildi! Akademi artık sana daha uygun. ✨");
  renderSettings();
  studentChipName.textContent = state.settings.studentName || "Öğrenci";
}

function applyTheme() {
  document.body.classList.remove("theme-purple", "theme-green", "theme-orange");
  if (state.settings.theme && state.settings.theme !== "blue") document.body.classList.add(`theme-${state.settings.theme}`);
  const colors = { blue: "#5267e8", purple: "#8b5edb", green: "#2fa77f", orange: "#e77b35" };
  document.querySelector('meta[name="theme-color"]').setAttribute("content", colors[state.settings.theme] || colors.blue);
}

function getStudentProgress(student) {
  const value = Array.isArray(student.student_progress) ? student.student_progress[0] : student.student_progress;
  return value || { payload: {}, completed_count: 0, plan_percent: 0, last_activity: null };
}

async function loadTeacherData() {
  teacherContent.innerHTML = `<div class="teacher-loading"><span class="button-spinner dark"></span><strong>Sınıf verileri hazırlanıyor…</strong></div>`;
  const [classesResult, studentsResult] = await Promise.all([
    cloudClient.from("classes").select("id,name,code_hint,active,created_at").eq("active", true).order("created_at"),
    cloudClient.from("students").select("id,class_id,name,code_hint,active,created_at,student_progress(payload,completed_count,plan_percent,last_activity,updated_at)").eq("active", true).order("name")
  ]);
  if (classesResult.error || studentsResult.error) {
    teacherContent.innerHTML = `<div class="teacher-error"><span>⚠️</span><h2>Veriler açılamadı</h2><p>Veri tabanı kurulumunun tamamlandığını kontrol edip yeniden deneyin.</p><button class="button primary" type="button" data-action="reload-teacher">Yeniden Dene</button></div>`;
    return;
  }
  teacherStore.classes = classesResult.data || [];
  teacherStore.students = studentsResult.data || [];
  if (!teacherStore.activeClassId || !teacherStore.classes.some(item => item.id === teacherStore.activeClassId)) {
    teacherStore.activeClassId = teacherStore.classes[0]?.id || null;
  }
  renderTeacherDashboard();
}

function renderTeacherDashboard() {
  const activeClass = teacherStore.classes.find(item => item.id === teacherStore.activeClassId) || null;
  const visibleStudents = activeClass ? teacherStore.students.filter(item => item.class_id === activeClass.id) : [];
  const allProgress = teacherStore.students.map(getStudentProgress);
  const activeThisWeek = allProgress.filter(item => item.last_activity && (Date.now() - new Date(item.last_activity).getTime()) < 7 * 86400000).length;
  const averageModules = allProgress.length ? (allProgress.reduce((sum, item) => sum + Number(item.completed_count || 0), 0) / allProgress.length).toFixed(1) : "0";
  const averagePlan = allProgress.length ? Math.round(allProgress.reduce((sum, item) => sum + Number(item.plan_percent || 0), 0) / allProgress.length) : 0;

  teacherContent.innerHTML = `
    <section class="teacher-welcome">
      <div><span class="section-tag">ÖĞRETMEN KONTROL MERKEZİ</span><h1>Öğrencilerinizin gelişimi<br>tek bir yerde.</h1><p>Modül ilerlemelerini, haftalık planlarını ve kendi cevaplarını güncel olarak inceleyin.</p></div>
      <div class="teacher-date"><span>BUGÜN</span><strong>${new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long" }).format(new Date())}</strong><small>${new Intl.DateTimeFormat("tr-TR", { weekday: "long" }).format(new Date())}</small></div>
    </section>
    <div class="teacher-stat-grid">
      ${teacherStat("👥", "Toplam öğrenci", teacherStore.students.length, "Kayıtlı öğrenci")}
      ${teacherStat("⚡", "Bu hafta aktif", activeThisWeek, "Son 7 gün")}
      ${teacherStat("📚", "Ortalama modül", `${averageModules} / 10`, "Sınıf ortalaması")}
      ${teacherStat("🗓️", "Plan ortalaması", `%${averagePlan}`, "Haftalık tamamlama")}
    </div>

    <div class="teacher-dashboard-grid">
      <aside class="teacher-class-panel">
        <div class="teacher-panel-title"><div><span class="section-tag">SINIFLARIM</span><h2>Sınıflar</h2></div><span class="count-badge">${teacherStore.classes.length}</span></div>
        <div class="class-list">${teacherStore.classes.length ? teacherStore.classes.map(item => {
          const count = teacherStore.students.filter(student => student.class_id === item.id).length;
          return `<button class="class-list-item ${item.id === teacherStore.activeClassId ? "active" : ""}" type="button" data-action="select-teacher-class" data-class-id="${item.id}"><span>📘</span><div><strong>${escapeHTML(item.name)}</strong><small>${count} öğrenci • ${escapeHTML(item.code_hint)}</small></div><b>›</b></button>`;
        }).join("") : `<div class="empty-mini">Henüz sınıf oluşturmadınız.</div>`}</div>
        <form id="create-class-form" class="teacher-mini-form" novalidate><h3>＋ Yeni sınıf oluştur</h3><input name="className" maxlength="80" placeholder="Sınıf adı: 7/A Türkçe" aria-label="Sınıf adı"><input name="classCode" maxlength="20" placeholder="Sınıf kodu: TURKCE7A" aria-label="Sınıf kodu"><div class="login-message" data-form-message></div><button class="button primary small" type="submit">Sınıfı Oluştur</button></form>
      </aside>

      <section class="teacher-main-panel">
        ${activeClass ? `
          <div class="class-header"><div><span class="section-tag">AKTİF SINIF</span><h2>${escapeHTML(activeClass.name)}</h2><p>Öğrenciler giriş yaparken <strong>${escapeHTML(activeClass.code_hint)}</strong> sınıf kodunu kullanır.</p></div><button class="button secondary small" type="button" data-action="copy-class-code" data-code="${escapeHTML(activeClass.code_hint)}">📋 Sınıf Kodunu Kopyala</button></div>
          <div class="teacher-toolbar"><label class="search-box"><span>⌕</span><input id="student-search" placeholder="Öğrenci ara…" autocomplete="off"></label><button class="button primary small" type="button" data-action="toggle-add-student">＋ Öğrenci Ekle</button></div>
          <form id="add-student-form" class="add-student-form" hidden novalidate>
            <div><span class="section-tag">YENİ ÖĞRENCİ</span><h3>Öğrenci giriş bilgisi oluştur</h3></div>
            <div class="field-group"><label for="new-student-name">Öğrenci adı</label><input id="new-student-name" name="studentName" maxlength="80" placeholder="Ad Soyad"></div>
            <div class="field-group"><label for="new-student-code">Öğrenci kodu</label><div class="code-input"><input id="new-student-code" name="studentCode" maxlength="20" placeholder="En az 6 karakter"><button type="button" data-action="generate-student-code">Üret</button></div></div>
            <div class="login-message" data-form-message></div><button class="button primary" type="submit">Öğrenciyi Kaydet</button>
          </form>
          ${renderTeacherStudentTable(visibleStudents)}
        ` : `<div class="teacher-empty-class"><span>🏫</span><h2>İlk sınıfınızı oluşturun</h2><p>Soldaki kısa formu kullanın. Ardından öğrenci kodlarını oluşturarak sınıfınıza ekleyebilirsiniz.</p></div>`}
      </section>
    </div>`;
}

function teacherStat(icon, label, value, note) {
  return `<article class="teacher-stat"><span>${icon}</span><div><small>${label}</small><strong>${value}</strong><p>${note}</p></div></article>`;
}

function renderTeacherStudentTable(students) {
  if (!students.length) return `<div class="teacher-empty-class compact"><span>👋</span><h2>Bu sınıf henüz boş</h2><p>“Öğrenci Ekle” düğmesiyle ilk öğrenci giriş kodunu oluşturabilirsiniz.</p></div>`;
  return `<div class="student-table-wrap"><table class="student-table"><thead><tr><th>Öğrenci</th><th>Giriş kodu</th><th>Modül ilerlemesi</th><th>Plan</th><th>Son çalışma</th><th></th></tr></thead><tbody>${students.map(student => {
    const progress = getStudentProgress(student);
    return `<tr data-student-row data-search-name="${escapeHTML(student.name.toLocaleLowerCase("tr-TR"))}"><td><div class="student-name-cell"><span>${escapeHTML(student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</span><div><strong>${escapeHTML(student.name)}</strong><small>${progress.last_activity ? "Aktif öğrenci" : "Henüz başlamadı"}</small></div></div></td><td><button class="code-chip" type="button" data-action="copy-student-code" data-code="${escapeHTML(student.code_hint)}">${escapeHTML(student.code_hint)} 📋</button></td><td><div class="table-progress"><div><i style="width:${Number(progress.completed_count || 0) * 10}%"></i></div><strong>${Number(progress.completed_count || 0)} / 10</strong></div></td><td><span class="percent-chip ${Number(progress.plan_percent || 0) >= 70 ? "good" : ""}">%${Number(progress.plan_percent || 0)}</span></td><td><span class="last-seen">${progress.last_activity ? formatRelativeDate(progress.last_activity) : "—"}</span></td><td><div class="row-actions"><button class="button ghost small" type="button" data-action="view-student" data-student-id="${student.id}">İncele →</button><button class="manage-student-button" type="button" data-action="manage-student" data-student-id="${student.id}" aria-label="${escapeHTML(student.name)} için düzenleme seçeneklerini aç" title="Öğrenciyi yönet">•••</button></div></td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function formatRelativeDate(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "Şimdi";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} dk. önce`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} sa. önce`;
  if (diff < 7 * 86400000) return `${Math.floor(diff / 86400000)} gün önce`;
  return formatDate(iso);
}

function renderTeacherStudentDetail(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  teacherStore.selectedStudentId = studentId;
  const progress = getStudentProgress(student);
  const payload = progress.payload || {};
  const completedIds = Object.keys(payload.completed || {}).map(Number);
  const activityCount = Object.values(payload.activities || {}).filter(record => Object.keys(record.choices || {}).length > 0).length;
  const answeredModules = Object.entries(payload.answers || {}).sort((a, b) => new Date(b[1]?.savedAt || 0) - new Date(a[1]?.savedAt || 0));
  const activityEntries = Object.entries(payload.activities || {}).filter(([, record]) => Object.keys(record.choices || {}).length > 0);
  const plan = Array.isArray(payload.plan) ? payload.plan : [];
  const plannedItems = plan.filter(item => item.subject || item.topic || item.duration);

  teacherContent.insertAdjacentHTML("beforeend", `<div class="teacher-modal" id="teacher-student-modal"><div class="teacher-modal-backdrop" data-action="close-student-detail"></div><article class="student-detail-sheet">
    <header class="student-detail-header"><div class="student-detail-identity"><span>${escapeHTML(student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</span><div><small>ÖĞRENCİ GELİŞİM DOSYASI</small><h2>${escapeHTML(student.name)}</h2><p>Son güncelleme: ${progress.last_activity ? formatDate(progress.last_activity) : "Henüz çalışma yok"}</p></div></div><button class="modal-close" type="button" data-action="close-student-detail" aria-label="Kapat">×</button></header>
    <div class="student-detail-body">
      <div class="student-detail-stats"><div><span>Tamamlanan modül</span><strong>${completedIds.length} / 10</strong></div><div><span>Haftalık plan</span><strong>%${Number(progress.plan_percent || 0)}</strong></div><div><span>Yanıtlanan uygulama</span><strong>${answeredModules.length}</strong></div><div><span>Etkileşimli atölye</span><strong>${activityEntries.length}</strong></div></div>
      <section class="detail-section"><div class="detail-title"><div><span class="section-tag">MODÜLLER</span><h3>Beceri gelişimi</h3></div></div><div class="detail-module-grid">${MODULES.map(module => `<div class="detail-module ${completedIds.includes(module.id) ? "done" : answeredModules.some(([id]) => Number(id) === module.id) ? "progress" : ""}"><span>${completedIds.includes(module.id) ? "✓" : module.icon}</span><div><small>${module.id}. Hafta</small><strong>${module.title}</strong></div></div>`).join("")}</div></section>
      <section class="detail-section"><div class="detail-title"><div><span class="section-tag">ETKİLEŞİMLİ ATÖLYELER</span><h3>Karar, güven ve görev takibi</h3></div></div>${activityEntries.length ? `<div class="teacher-activity-list">${activityEntries.map(([id, record]) => {
        const lab = ACTIVITY_LABS[id];
        if (!lab) return "";
        const answered = Object.keys(record.choices || {}).length;
        const correct = lab.items.filter((item, index) => record.choices?.[index] === item[1]).length;
        return `<article class="teacher-activity-item"><span>${lab.icon}</span><div><small>${id}. MODÜL ATÖLYESİ</small><strong>${lab.title}</strong><p>${escapeHTML(record.reflection || "Öğrenci henüz düşünce notu yazmadı.")}</p></div><div class="teacher-activity-metrics"><b>${correct}/${answered || lab.items.length}</b><small>${(record.missionDays || []).filter(Boolean).length}/7 görev</small><em>${record.confidenceBefore || "–"} → ${record.confidenceAfter || "–"} güven</em></div></article>`;
      }).join("")}</div>` : `<div class="empty-mini wide">Öğrenci henüz etkileşimli atölyeye başlamadı.</div>`}</section>
      <section class="detail-section"><div class="detail-title"><div><span class="section-tag">ÖĞRENCİ CEVAPLARI</span><h3>Son uygulamalar</h3></div></div>${answeredModules.length ? `<div class="answer-accordion">${answeredModules.map(([id, record]) => {
        const module = MODULES.find(item => item.id === Number(id));
        if (!module) return "";
        const answers = module.fields.filter(field => record.values?.[field[0]]).map(field => `<div><small>${field[1]}</small><p>${escapeHTML(record.values[field[0]])}</p></div>`).join("");
        return `<details><summary><span>${module.icon}</span><div><small>${module.id}. MODÜL</small><strong>${module.title}</strong></div><b>＋</b></summary><div class="answer-detail">${answers}</div></details>`;
      }).join("")}</div>` : `<div class="empty-mini wide">Öğrenci henüz bir uygulama cevabı kaydetmedi.</div>`}</section>
      <section class="detail-section"><div class="detail-title"><div><span class="section-tag">HAFTALIK PLAN</span><h3>Planlanan çalışmalar</h3></div></div>${plannedItems.length ? `<div class="detail-plan-list">${plannedItems.map(item => `<div class="detail-plan-item ${item.done ? "done" : ""}"><span>${item.done ? "✓" : item.day.slice(0, 2)}</span><div><strong>${escapeHTML(item.subject)} • ${escapeHTML(item.topic)}</strong><small>${escapeHTML(item.day)} • ${escapeHTML(item.duration)} dakika${item.note ? ` • ${escapeHTML(item.note)}` : ""}</small></div></div>`).join("")}</div>` : `<div class="empty-mini wide">Öğrenci henüz haftalık plan oluşturmadı.</div>`}</section>
    </div>
    <footer class="student-detail-footer"><button class="button ghost" type="button" data-action="close-student-detail">Kapat</button><button class="button secondary" type="button" data-action="manage-student" data-student-id="${student.id}">✏️ Öğrenciyi Düzenle</button><button class="button primary" type="button" data-action="copy-remote-report" data-student-id="${student.id}">📋 Öğrenci Raporunu Kopyala</button></footer>
  </article></div>`);
}

function renderStudentManagementModal(studentId) {
  document.querySelector("#teacher-student-modal")?.remove();
  document.querySelector("#student-management-modal")?.remove();
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const progress = getStudentProgress(student);
  teacherContent.insertAdjacentHTML("beforeend", `<div class="teacher-modal management-modal" id="student-management-modal"><div class="teacher-modal-backdrop" data-action="close-student-management"></div><article class="management-dialog">
    <header class="management-header"><div><span class="section-tag">ÖĞRENCİ YÖNETİMİ</span><h2>${escapeHTML(student.name)}</h2><p>Öğrencinin giriş bilgilerini ve çalışmalarını yönetin.</p></div><button class="modal-close" type="button" data-action="close-student-management" aria-label="Kapat">×</button></header>
    <form id="edit-student-form" class="management-form" data-student-id="${student.id}" novalidate>
      <div class="management-avatar">${escapeHTML(student.name.charAt(0).toLocaleUpperCase("tr-TR"))}</div>
      <div class="field-group"><label for="edit-student-name">Öğrenci adı</label><input id="edit-student-name" name="studentName" maxlength="80" value="${escapeHTML(student.name)}" required><small>Öğretmen panelinde ve öğrenci girişinde bu ad görünür.</small></div>
      <div class="field-group"><label for="edit-student-code">Öğrenci giriş kodu</label><div class="code-input"><input id="edit-student-code" name="studentCode" maxlength="20" value="${escapeHTML(student.code_hint)}" required><button type="button" data-action="generate-edit-student-code">Yenile</button></div><small>Kodu değiştirirseniz eski kod hemen geçersiz olur.</small></div>
      <div class="login-message" data-form-message role="alert"></div>
      <button class="button primary" type="submit">Değişiklikleri Kaydet ✓</button>
    </form>
    <section class="management-danger-zone"><div><span>↺</span><div><strong>Çalışma ilerlemesini sıfırla</strong><p>${Number(progress.completed_count || 0)} modül ve haftalık plan bilgileri temizlenir. Öğrenci hesabı kalır.</p></div></div><button class="button ghost small" type="button" data-action="reset-student-progress" data-student-id="${student.id}">İlerlemeyi Sıfırla</button></section>
    <section class="management-danger-zone delete"><div><span>🗑️</span><div><strong>Öğrenciyi sınıftan sil</strong><p>Öğrenci ve tüm çalışma verileri kalıcı olarak silinir. Bu işlem geri alınamaz.</p></div></div><button class="button danger small" type="button" data-action="delete-student" data-student-id="${student.id}">Öğrenciyi Sil</button></section>
  </article></div>`);
}

function buildRemoteStudentReport(student) {
  const progress = getStudentProgress(student);
  const payload = progress.payload || {};
  const completedIds = Object.keys(payload.completed || {}).map(Number);
  const activityCount = Object.values(payload.activities || {}).filter(record => Object.keys(record.choices || {}).length > 0).length;
  const answers = Object.entries(payload.answers || {}).sort((a, b) => new Date(b[1]?.savedAt || 0) - new Date(a[1]?.savedAt || 0));
  const lastAnswer = answers[0];
  let lastAnswerText = "Henüz uygulama cevabı yok.";
  if (lastAnswer) {
    const module = MODULES.find(item => item.id === Number(lastAnswer[0]));
    lastAnswerText = `${module?.title || "Modül"}\n${module?.fields.filter(field => lastAnswer[1].values?.[field[0]]).map(field => `${field[1]} ${lastAnswer[1].values[field[0]]}`).join("\n") || ""}`;
  }
  return `VERİMLİ DERS ÇALIŞMA AKADEMİSİ\nÖĞRETMEN GELİŞİM RAPORU\n\nÖğrenci: ${student.name}\nTarih: ${new Intl.DateTimeFormat("tr-TR").format(new Date())}\nTamamlanan modül: ${completedIds.length} / 10\nEtkileşimli atölye: ${activityCount} / 10\nHaftalık plan: %${Number(progress.plan_percent || 0)}\nSon etkinlik: ${progress.last_activity ? formatDate(progress.last_activity) : "Henüz yok"}\n\nTamamlanan modüller:\n${completedIds.length ? completedIds.map(id => `${id}. ${MODULES.find(module => module.id === id)?.title || ""}`).join("\n") : "Henüz yok"}\n\nSon uygulama:\n${lastAnswerText}`;
}

async function createTeacherClass(form) {
  const name = form.elements.className.value.trim();
  const code = form.elements.classCode.value.trim().toUpperCase();
  const message = form.querySelector("[data-form-message]");
  if (!name || code.length < 6) {
    message.textContent = "Sınıf adı ve en az 6 karakterli bir kod yazın.";
    message.className = "login-message show error";
    return;
  }
  setFormBusy(form, true, "Oluşturuluyor…");
  const { error } = await cloudClient.rpc("teacher_create_class", { p_name: name, p_code: code });
  setFormBusy(form, false);
  if (error) {
    message.textContent = error.message || "Sınıf oluşturulamadı.";
    message.className = "login-message show error";
    return;
  }
  showToast("Yeni sınıf oluşturuldu. Şimdi öğrencileri ekleyebilirsiniz. 🏫");
  await loadTeacherData();
}

async function addTeacherStudent(form) {
  const name = form.elements.studentName.value.trim();
  const code = form.elements.studentCode.value.trim().toUpperCase();
  const message = form.querySelector("[data-form-message]");
  if (!name || code.length < 6) {
    message.textContent = "Öğrenci adı ve en az 6 karakterli bir kod yazın.";
    message.className = "login-message show error";
    return;
  }
  setFormBusy(form, true, "Kaydediliyor…");
  const { error } = await cloudClient.rpc("teacher_add_student", { p_class_id: teacherStore.activeClassId, p_name: name, p_code: code });
  setFormBusy(form, false);
  if (error) {
    message.textContent = error.message || "Öğrenci eklenemedi.";
    message.className = "login-message show error";
    return;
  }
  showToast(`${name} sınıfa eklendi. Giriş kodunu öğrenciyle paylaşabilirsiniz. 🎒`);
  await loadTeacherData();
}

async function updateTeacherStudent(form) {
  const studentId = form.dataset.studentId;
  const name = form.elements.studentName.value.trim();
  const code = form.elements.studentCode.value.trim().toUpperCase();
  const message = form.querySelector("[data-form-message]");
  if (!name || code.length < 6) {
    message.textContent = "Öğrenci adı ve en az 6 karakterli bir giriş kodu yazın.";
    message.className = "login-message show error";
    return;
  }
  setFormBusy(form, true, "Kaydediliyor…");
  const { error } = await cloudClient.rpc("teacher_update_student", { p_student_id: studentId, p_name: name, p_code: code });
  setFormBusy(form, false);
  if (error) {
    message.textContent = error.message || "Öğrenci bilgileri güncellenemedi.";
    message.className = "login-message show error";
    return;
  }
  document.querySelector("#student-management-modal")?.remove();
  showToast(`${name} için giriş bilgileri güncellendi. ✓`);
  await loadTeacherData();
}

async function resetTeacherStudentProgress(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const confirmed = window.confirm(`${student.name} adlı öğrencinin tüm modül cevapları ve haftalık planı sıfırlanacak. Öğrenci hesabı korunacak. Devam etmek istiyor musunuz?`);
  if (!confirmed) return;
  const { error } = await cloudClient.rpc("teacher_reset_student_progress", { p_student_id: studentId });
  if (error) {
    showToast("İlerleme sıfırlanamadı. Lütfen tekrar deneyin.", "error");
    return;
  }
  document.querySelector("#student-management-modal")?.remove();
  showToast(`${student.name} için çalışma ilerlemesi sıfırlandı.`);
  await loadTeacherData();
}

async function deleteTeacherStudent(studentId) {
  const student = teacherStore.students.find(item => item.id === studentId);
  if (!student) return;
  const confirmed = window.confirm(`${student.name} adlı öğrenci ve tüm çalışma verileri kalıcı olarak silinecek. Bu işlem geri alınamaz. Silmek istediğinize emin misiniz?`);
  if (!confirmed) return;
  const { error } = await cloudClient.rpc("teacher_delete_student", { p_student_id: studentId });
  if (error) {
    showToast("Öğrenci silinemedi. Lütfen tekrar deneyin.", "error");
    return;
  }
  document.querySelector("#student-management-modal")?.remove();
  showToast(`${student.name} sınıftan silindi.`);
  await loadTeacherData();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch (error) {
    showToast("Kopyalama izni verilemedi. Metni elle seçebilirsiniz.", "error");
  }
}

async function studentLogout() {
  await synchronizeStudent();
  localStorage.removeItem(STORAGE_KEYS.cloudSession);
  cloudSession = null;
  showWorkspace("gateway");
  document.querySelector("#student-login-form")?.reset();
}

async function teacherLogout() {
  await cloudClient?.auth.signOut({ scope: "local" });
  localStorage.removeItem(STORAGE_KEYS.cloudSession);
  cloudSession = null;
  teacherStore = { classes: [], students: [], activeClassId: null, selectedStudentId: null };
  showWorkspace("gateway");
  document.querySelector("#teacher-login-form")?.reset();
}

function resetAllData() {
  const confirmed = window.confirm("Tüm cevapların, modül ilerlemen, haftalık planın ve ayarların silinecek. Yeni bir başlangıç yapmak istediğine emin misin?");
  if (!confirmed) return;
  Object.values(STORAGE_KEYS).filter(key => key !== STORAGE_KEYS.cloudSession).forEach(key => localStorage.removeItem(key));
  state.settings = { studentName: "", dailyGoal: 30, theme: "blue" };
  state.answers = {};
  state.checks = {};
  state.completed = {};
  state.plan = createEmptyPlan();
  state.quizzes = {};
  state.activities = {};
  persistStudentStateLocally();
  scheduleStudentSync();
  showToast("Tüm veriler temizlendi. Yeni bir başlangıç yapabilirsin. 🌱");
  navigate("home");
}

function handleQuizAnswer(moduleId, selected) {
  const quiz = MODULE_EXTRAS[moduleId]?.quiz;
  if (!quiz || !Number.isInteger(selected)) return;
  state.quizzes[moduleId] = { selected, answeredAt: new Date().toISOString() };
  saveData(STORAGE_KEYS.quizzes, state.quizzes);
  const quizElement = document.querySelector(`#module-quiz-${moduleId}`);
  if (quizElement) quizElement.outerHTML = renderModuleQuiz(moduleId);
  updateModuleProgressFromState(moduleId);
  if (selected === quiz.answer) showToast("Doğru cevap! Yöntemi yakaladın. 🌟");
}

function ensureActivityRecord(moduleId) {
  if (!state.activities[moduleId]) state.activities[moduleId] = { choices: {}, missionDays: [] };
  if (!state.activities[moduleId].choices) state.activities[moduleId].choices = {};
  if (!Array.isArray(state.activities[moduleId].missionDays)) state.activities[moduleId].missionDays = [];
  const reflection = document.querySelector(`#activity-reflection-${moduleId}`);
  if (reflection) state.activities[moduleId].reflection = reflection.value.trim();
  return state.activities[moduleId];
}

function updateModuleProgressFromState(moduleId) {
  const module = MODULES.find(item => item.id === moduleId);
  if (!module) return;
  const filled = module.fields.filter(field => String(state.answers[moduleId]?.values?.[field[0]] || "").trim()).length;
  const checked = (state.checks[moduleId] || []).filter(Boolean).length;
  const quizPoint = Number.isInteger(state.quizzes[moduleId]?.selected) ? 1 : 0;
  const labPoint = state.completed[moduleId] || Object.keys(state.activities[moduleId]?.choices || {}).length === ACTIVITY_LABS[moduleId].items.length ? 1 : 0;
  const progress = Math.round(((filled + checked + quizPoint + labPoint) / (module.fields.length + module.checks.length + 2)) * 100);
  const progressFill = document.querySelector(".module-progress .progress-fill");
  const progressValue = document.querySelector(".module-progress .progress-line strong");
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (progressValue) progressValue.textContent = `%${progress}`;
}

function refreshInteractiveLab(moduleId) {
  saveData(STORAGE_KEYS.activities, state.activities);
  const element = document.querySelector(`#activity-lab-${moduleId}`);
  if (element) element.outerHTML = renderInteractiveLab(moduleId);
  updateModuleProgressFromState(moduleId);
}

function handleActivityChoice(moduleId, itemIndex, category) {
  const record = ensureActivityRecord(moduleId);
  record.choices[itemIndex] = category;
  record.updatedAt = new Date().toISOString();
  refreshInteractiveLab(moduleId);
}

function handleActivityConfidence(moduleId, stage, value) {
  const record = ensureActivityRecord(moduleId);
  if (stage === "before") record.confidenceBefore = value;
  else record.confidenceAfter = value;
  record.updatedAt = new Date().toISOString();
  refreshInteractiveLab(moduleId);
}

function handleActivityDay(moduleId, dayIndex) {
  const record = ensureActivityRecord(moduleId);
  record.missionDays[dayIndex] = !record.missionDays[dayIndex];
  record.updatedAt = new Date().toISOString();
  refreshInteractiveLab(moduleId);
  if (record.missionDays.filter(Boolean).length === 7) showToast("7 günlük görevi tamamladın! Bu gerçek bir alışkanlık adımı. 🏆");
}

function saveActivityReflection(moduleId) {
  const record = ensureActivityRecord(moduleId);
  record.updatedAt = new Date().toISOString();
  saveData(STORAGE_KEYS.activities, state.activities);
  showToast("Etkinlik düşüncen kaydedildi. ✨");
}

document.addEventListener("click", event => {
  const authTab = event.target.closest("[data-auth-tab]");
  if (authTab) {
    const role = authTab.dataset.authTab;
    document.querySelectorAll("[data-auth-tab]").forEach(button => {
      const active = button.dataset.authTab === role;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelector("#student-login-form").hidden = role !== "student";
    document.querySelector("#teacher-login-form").hidden = role !== "teacher";
    return;
  }

  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    navigate(pageButton.dataset.page);
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;

  if (action === "open-module") navigate("modules", { moduleId: Number(actionButton.dataset.moduleId) });
  else if (action === "back-modules") navigate("modules");
  else if (action === "quiz-option") handleQuizAnswer(Number(actionButton.dataset.moduleId), Number(actionButton.dataset.optionIndex));
  else if (action === "activity-choice") handleActivityChoice(Number(actionButton.dataset.moduleId), Number(actionButton.dataset.itemIndex), actionButton.dataset.category);
  else if (action === "activity-confidence") handleActivityConfidence(Number(actionButton.dataset.moduleId), actionButton.dataset.stage, Number(actionButton.dataset.value));
  else if (action === "activity-day") handleActivityDay(Number(actionButton.dataset.moduleId), Number(actionButton.dataset.dayIndex));
  else if (action === "save-activity-reflection") saveActivityReflection(Number(actionButton.dataset.moduleId));
  else if (action === "save-draft") {
    const form = document.querySelector("#module-form");
    if (saveModuleDraft(form)) {
      showToast("Taslağın bu cihazda saklandı. İstediğinde devam edebilirsin. 💾");
      renderModuleDetail(Number(form.dataset.moduleId));
    }
  }
  else if (action === "clear-plan") {
    if (window.confirm("Haftalık planındaki tüm alanları temizlemek istediğine emin misin?")) {
      state.plan = createEmptyPlan();
      localStorage.removeItem(STORAGE_KEYS.plan);
      scheduleStudentSync();
      renderPlan();
      showToast("Plan temizlendi. Yeni bir hafta planlayabilirsin. 🌿");
    }
  }
  else if (action === "copy-report") copyReport();
  else if (action === "share-whatsapp") window.open(`https://wa.me/?text=${encodeURIComponent(buildReportText())}`, "_blank", "noopener,noreferrer");
  else if (action === "share-email") window.location.href = `mailto:?subject=${encodeURIComponent("Verimli Ders Çalışma Akademisi - Gelişim Raporum")}&body=${encodeURIComponent(buildReportText())}`;
  else if (action === "select-theme") {
    const form = document.querySelector("#settings-form");
    form.elements.theme.value = actionButton.dataset.theme;
    state.settings.theme = actionButton.dataset.theme;
    applyTheme();
    document.querySelectorAll(".theme-option").forEach(button => {
      const active = button === actionButton;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  else if (action === "reset-data") resetAllData();
  else if (action === "student-logout") studentLogout();
  else if (action === "teacher-logout") teacherLogout();
  else if (action === "reload-teacher") loadTeacherData();
  else if (action === "select-teacher-class") {
    teacherStore.activeClassId = actionButton.dataset.classId;
    renderTeacherDashboard();
  }
  else if (action === "toggle-add-student") {
    const form = document.querySelector("#add-student-form");
    form.hidden = !form.hidden;
    if (!form.hidden) form.elements.studentName.focus();
  }
  else if (action === "generate-student-code") {
    const form = document.querySelector("#add-student-form");
    const namePart = form.elements.studentName.value.trim().split(/\s+/)[0].toLocaleUpperCase("tr-TR").replace(/[^A-ZÇĞİÖŞÜ]/g, "").slice(0, 5) || "OGR";
    form.elements.studentCode.value = `${namePart}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  else if (action === "copy-class-code") copyText(actionButton.dataset.code, "Sınıf kodu kopyalandı. 📋");
  else if (action === "copy-student-code") copyText(actionButton.dataset.code, "Öğrenci kodu kopyalandı. 📋");
  else if (action === "view-student") renderTeacherStudentDetail(actionButton.dataset.studentId);
  else if (action === "close-student-detail") document.querySelector("#teacher-student-modal")?.remove();
  else if (action === "manage-student") renderStudentManagementModal(actionButton.dataset.studentId);
  else if (action === "close-student-management") document.querySelector("#student-management-modal")?.remove();
  else if (action === "generate-edit-student-code") {
    const form = document.querySelector("#edit-student-form");
    const namePart = form.elements.studentName.value.trim().split(/\s+/)[0].toLocaleUpperCase("tr-TR").replace(/[^A-ZÇĞİÖŞÜ]/g, "").slice(0, 5) || "OGR";
    form.elements.studentCode.value = `${namePart}-${Math.floor(1000 + Math.random() * 9000)}`;
  }
  else if (action === "reset-student-progress") resetTeacherStudentProgress(actionButton.dataset.studentId);
  else if (action === "delete-student") deleteTeacherStudent(actionButton.dataset.studentId);
  else if (action === "copy-remote-report") {
    const student = teacherStore.students.find(item => item.id === actionButton.dataset.studentId);
    if (student) copyText(buildRemoteStudentReport(student), `${student.name} için rapor kopyalandı. 📋`);
  }
});

document.addEventListener("submit", event => {
  event.preventDefault();
  if (event.target.id === "module-form") completeModule(event.target);
  else if (event.target.id === "plan-form") savePlan(event.target);
  else if (event.target.id === "settings-form") saveSettings(event.target);
  else if (event.target.id === "student-login-form") handleStudentLogin(event.target);
  else if (event.target.id === "teacher-login-form") handleTeacherLogin(event.target);
  else if (event.target.id === "create-class-form") createTeacherClass(event.target);
  else if (event.target.id === "add-student-form") addTeacherStudent(event.target);
  else if (event.target.id === "edit-student-form") updateTeacherStudent(event.target);
});

document.addEventListener("input", event => {
  if (event.target.id === "student-search") {
    const query = event.target.value.trim().toLocaleLowerCase("tr-TR");
    document.querySelectorAll("[data-student-row]").forEach(row => {
      row.hidden = query && !row.dataset.searchName.includes(query);
    });
  }
});

document.addEventListener("change", event => {
  if (event.target.matches('#plan-form input[type="checkbox"]')) {
    event.target.closest("tr").classList.toggle("done", event.target.checked);
  }
});

window.addEventListener("online", () => {
  if (cloudSession?.role === "student") synchronizeStudent();
});
window.addEventListener("offline", () => {
  if (cloudSession?.role === "student") updateCloudStatus("offline", "Çevrim dışı • yerel kayıt");
});

initializeApplication();
