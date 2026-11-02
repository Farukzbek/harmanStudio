# Harman

Basit, ücretsiz, reklamsız ve açık kaynaklı müzik karıştırma aracı (macOS). Şarkıları yükle, istediğin yerlerinden kes, vokali ve enstrümanları ayır, iki şarkının tempo ve tonunu eşleştir, fade ve crossfade ile birleştir, MP3 veya WAV olarak kaydet. Müzik prodüksiyonu bilmen gerekmez.

> Durum: v0.1, erken sürüm. Şu an yalnızca macOS (Apple Silicon) hedeflenir.

**English:** Harman is a simple, free, ad-free, open-source music mixing app for macOS (Apple Silicon). Import songs, cut and merge them on a 4-lane timeline, fade and crossfade, separate vocals and instruments, match tempo and key, get smart transition suggestions, save projects with automatic backup, and export as MP3 or WAV. The interface and this documentation are in Turkish. To try it: `npm install && npm start` (requires Node.js 18+, and `ffmpeg` for MP3 export). Code is MIT licensed.

## Özellikler

**Düzenleme**
- MP3, WAV, FLAC, M4A, OGG ve daha fazlasını ekle (butonla veya sürükle-bırak)
- 4 hatlı zaman çizelgesi: parçaları sürükle, kenarlarından kes, oynatma çizgisinden böl, çoğalt
- Fade in / fade out ve eşit güçlü crossfade (iki parça üst üste binince geçişte ses çukuru oluşmaz); kesim noktalarında tık sesini önleyen otomatik mikro fade
- Geri al / yinele, kopyala / kes / yapıştır, sağ tık menüleri
- Fareyle dikdörtgen çizerek toplu seçim; seçili parçaları birlikte taşı, böl, çoğalt, sil. Sürüklerken görünümün kenarına gelince otomatik kayar
- Her hattın sağ altında bir kutucuk: kapatırsan o hattaki parçalar çalmaz (kaydedilen mix'e de girmez)
- Her parça bağımsızdır: bir şarkıdan kesilen, çoğaltılan veya yapıştırılan parçaların BPM/ton düzeltmesi, vokal ayırma sonucu, tempo/ton değişikliği, zamanlı geçişleri ve sıfırlaması kendilerine aittir. Ses verisi paylaşıldığı için bellek harcanmaz; aynı sesten ayrılmış parçalar varsa yeniden hesaplanmadan kullanılır
- Çalarken yakınlaştır (⌥ + kaydır, trackpad'de sıkıştır), sağa sola git, istediğin saniyeye tıkla veya yaz; Boşluk son tıklanan yerden oynatır. Sol üstteki sayaç büyükte saniyeyi (61.37), küçükte dakika:saniyeyi (1:01.37) gösterir

**Ses ve karışım**
- Parça başına ses seviyesi (dB) ve sol / sağ denge
- Vokal / enstrüman ayırma: vokal, davul, bas, diğer. Her ses parçasının seviyesi ve sol/sağ dengesi ayrı; "Sadece vokal" / "Vokalsiz" ön ayarları
- Zamanlı geçişler (her ses parçası için ayrı): şarkının istediğin saniyeleri arasında seviyeyi bir yüzdeden başka bir yüzdeye (artan veya azalan) ve istersen yönü (sol/sağ) kademeli olarak götür. Ör. davul 54. saniyeden 75. saniyeye %12'den %86'ya yükselsin, sol kulaktan sağ kulağa geçsin
- Sürgülerin yanındaki değere (ör. "Sağ 3", "%80") tıklamak varsayılana döndürür

**Tempo ve ton**
- Otomatik BPM, ton (Camelot koduyla) ve ilk vuruş analizi; klip başlığında "124 BPM · 8A" etiketi
- Bir parçayı diğerinin tempoyuna ve tonuna getir (Rubber Band ile), vuruşları hizala
- Akıllı geçiş önerileri: iki parça için en iyi 3 geçişi önerir ve tek tıkla uygular

**Projeler ve güvenlik**
- Projeyi kaydet / aç (`.harman`, ⌘S / ⌥⌘O): tüm parçalar, ayarlar, zamanlı geçişler, tempo/ton değişiklikleri ve ayrılmış sesler olduğu gibi geri gelir; açınca yeniden ayırmak veya işlemek gerekmez. Orijinal şarkılar kopyalanmaz, yolla bağlanır; taşınmışsa açılışta yeni konumu göstermeni ister
- Otomatik yedek: değişiklik oldukça 15 saniyede bir arka planda yazılır. Uygulama çökerse ya da kapanırsa bir sonraki açılışta "geri yüklensin mi?" diye sorar
- Kaydedilmemiş değişiklik varken pencereyi kapatırsan (ya da ⌘Q) Kaydet / Kaydetme / Vazgeç diye sorar

**Çıktı**
- MP3 (320 kbps) veya WAV; biçim kaydetme penceresindeki dosya türünden seçilir
- İsteğe bağlı normalize: mix'in en yüksek ses tepesini −1 dB'e ayarlar

## Gereksinimler

- macOS, Apple Silicon (M1 ve sonrası). Vokal ayırma için gereklidir.
- [Node.js](https://nodejs.org) 18 veya üstü
- `ffmpeg`: MP3 kaydetmek ve Chromium'un açamadığı formatlar için. `brew install ffmpeg`
- Vokal ayırma ve tempo/ton için `uv` önerilir: `brew install uv` (yoksa Python 3.10 veya üstü aranır)

## Çalıştırma

```bash
npm install
npm start
```

### Masaüstü uygulaması olarak derleme

```bash
npm run package
```

`dist/` altına `Harman.app` üretir ve masaüstüne kısayol koyar. İkon betiği (`scripts/make-icon.js`) ilk derlemede çalışır.

Harman o sırada açıksa açık penceredeki çalışmayı bozmamak için yeni sürüm `dist-next/` klasörüne derlenir ve masaüstü kısayoluna dokunulmaz. Harman'ı kapatıp komutu tekrar çalıştırınca kısayol güncellenir.

## Projeler ve otomatik yedek

Çalışmanı ⌘S ile kaydedersen `Şarkı.harman` dosyası ve yanında `Şarkı.harman-data/` klasörü oluşur. Varsayılan konum `Belgeler/Harman Projeleri`.

- `.harman`: küçük bir JSON dosyası. Parçaların konumu, kırpması, fade'leri, seviyeleri, dengeleri, zamanlı geçişleri, BPM/ton bilgisi ve görünüm ayarları burada.
- `.harman-data/`: tempo/ton ile türetilmiş sesler ve ayrılmış vokal/enstrüman parçaları (16-bit WAV). Açarken yeniden ayırmak veya işlemek gerekmez. Orijinal şarkılar buraya kopyalanmaz, dosya yoluyla bağlanır; taşırsan açılışta yeni yerini sorar.
- Projeyi başka bir yere taşırken `.harman` dosyasıyla `-data` klasörünü birlikte taşı. Ayrılmış sesler çok yer tutar (bir şarkı için yaklaşık 150 MB).
- **Otomatik yedek:** değişiklik varken 15 saniyede bir `~/Library/Application Support/Harman/autosave` altına yazılır. Uygulama beklenmedik kapanırsa bir sonraki açılışta geri yüklemeyi önerir; düzgün kapatınca ya da kaydedince silinir.
- Kaydedilmemiş değişiklik varken pencereyi kapatırsan Kaydet / Kaydetme / Vazgeç sorulur.

## Vokal / enstrüman ayırma

Ayırma tamamen bilgisayarında çalışır, dosyaların dışarı gönderilmez.

- Parçayı seç, yan panelde **Vokal / enstrüman ayır…** (⇧⌘S).
- İlk kullanımda motor otomatik kurulur (yaklaşık 1 GB) ve seçilen model indirilir. Motor `~/Library/Application Support/Harman/engine` altında durur; uygulamayı yeniden derlemek bunu silmez.
- Modeller [mlx-audio-separator](https://pypi.org/project/mlx-audio-separator/) üzerinden gelir:

| Seçenek | Model | Çıktı | Hız* | İlk indirme | Tepe bellek |
|---|---|---|---|---|---|
| Hızlı | Demucs `htdemucs` | vokal, davul, bas, diğer | ≈ 10 kat | ≈ 85 MB | ≈ 2 GB |
| Kaliteli | Demucs `htdemucs_ft` | vokal, davul, bas, diğer | ≈ 3 kat | ≈ 330 MB | ≈ 3,3 GB |
| En temiz vokal | BS-RoFormer | vokal, enstrüman | ≈ 0,8 kat | ≈ 640 MB | ≈ 2,1 GB |

\* M2'de 4 dakikalık bir şarkıyla ölçüldü, gerçek zamana göre kat (yük altında düşebilir). Kaliteli ve En temiz vokal ilk kullanımda bu bilgisayar için dönüştürülür (birkaç dakika, tek seferlik).

**Bellek:** Ayırma sırasında MLX'in belleği toplam RAM'in yaklaşık %18'iyle sınırlanır ve işlem düşük öncelikle çalışır (`tools/separate.py`). Sınırsız bırakılınca 4 dakikalık bir şarkı 4-5 GB alıp 8 GB'lık bir Mac'i donduruyordu. Sınırla çıktı kalitesi değişmez. 8 GB'lık makinede Kaliteli model yine de ağırdır; günlük kullanım için Hızlı önerilir.

## Zamanlı geçişler

Ayrılmış bir ses parçasının (ör. Davul) altındaki **Zamanlı geçişler** panelinde:

1. Üstteki **+** / **−** düğmeleri seviyenin kademeli artmasını veya azalmasını seçer.
2. Başlangıç ve bitiş saniyesini, seviye başı ve sonu yüzdesini yaz. İstersen "Yönü de değiştir"i işaretleyip sol/sağ başı ve sonu (−100 tam sol, +100 tam sağ) gir. Seviye kutularını boş bırakırsan yalnızca yön değişir.
3. **Geçiş ekle**. Geçişten önce başlangıç, sonra hedef değerinde kalır. Geçişi olan değerin kaydırıcısı kilitlenir ("Zamanlı"); geçişleri listeden silebilirsin.

Saniyeler **zaman çizelgesindeki** saniyelerdir (cetvelde ve sol üstteki sayaçta gördüğün). Arka planda şarkı saniyesine çevrildiği için parçayı taşırsan, kırparsan veya bölersen geçiş sesin aynı yerinde kalır. Aralığın bir kısmı parçanın dışına taşabilir (geçiş o kadarıyla uygulanır); tamamen dışındaysa uygulama parçanın zaman çizelgesinde nerede olduğunu söyler ve listede "parça dışında" diye işaretlenir.

## Tempo ve ton eşleştirme

1. İki şarkı ekle. Her birinin BPM ve tonu otomatik analiz edilir (birkaç saniye).
2. İkinci parçayı seç, yan panelde **Tempo ve ton → Başka bir parçaya eşleştir**. Referans parçayı seç (varsayılan: üst üste bindiği parça).
3. **Uygula**: parça referansın tempoyuna yavaşlatılır/hızlandırılır, istersen tonu da kaydırılır. **Vuruşları hizala**: parçayı en fazla yarım vuruş kaydırıp vuruşları referansla aynı ızgaraya oturtur.

Bilmen gerekenler:

- Tempo hep **orijinalden** işlenir; tekrar uygulamak sesi katman katman bozmaz. **Orijinal tempo ve tona dön** ile geri alınır, ⌘Z de çalışır.
- Tempo değişimi %10'dan, ton kaydırması 3 yarım tondan büyükse ses bozulmaya başlar; uygulama uyarır.
- Tempo tek bir oktavda ([80, 160) BPM) aranır: 170 BPM'lik bir parça 85, 70 BPM'lik bir parça 140 görünebilir. Eşleştirme her zaman en yakın oktavı seçtiği için sorun olmaz, yanlışsa **½ / 2×** ile düzeltirsin.
- Ton tespiti tahminidir (özellikle majör ↔ bağıl minör karışabilir). Camelot kodundaki sayı aynıysa iki ton uyumludur. Yanlışsa tonu elle değiştir.
- Analiz ve eşleştirme sentetik şarkılarla doğrulandı (çeşitli davul kalıplarında tempo ±0,6 BPM, vuruş konumu ±20 ms). Gerçek müzikte doğruluk daha düşük olabilir.
- İlk kullanımda küçük bir araç (≈ 30 MB) otomatik kurulur: `~/Library/Application Support/Harman/tools`.

## Akıllı geçiş önerileri

Giren parçayı seç, **Tempo ve ton → Başka bir parçaya eşleştir** bölümünde referansı (çıkan parça) belirle, **Geçiş öner**'e bas (sağ tık menüsünde de var). Uygulama en iyi 3 geçişi puanlayarak listeler. Puan şunlardan oluşur:

- **Tempo:** giren parçayı çıkanın temposuna getirmek ne kadar küçük bir değişiklik
- **Ton:** uyumlu tona gelmek için gereken yarım ton kaydırması (Camelot)
- **Çıkış enerjisi:** çıkan parçanın enerjisi bu noktadan sonra düşüyor mu (outro, ara bölüm)
- **Giriş:** giren parçanın girişi sakin mi, ya da güçlü bir bölümüne (drop) giriyor mu
- **Konum:** geçiş çıkan parçanın sonuna uygun uzaklıkta mı

Geçiş noktaları çıkan parçanın vuruş ızgarasında (8 vuruşluk adımlarla, 16 vuruşluk cümle başları tercih edilir) aranır. **Uygula** şunları tek adımda yapar (tek ⌘Z geri alır): giren parçayı vuruşlar oturacak şekilde konumlar, çıkan parçayı geçişte bitirir, ikisine eşit güçlü crossfade verir, iki parçayı farklı hatlara koyar. Tempo ve ton kutuları açıksa giren parçanın tempo ve tonunu da ayarlar. **Uygula ve dinle** geçişten 6 saniye önce çalmaya başlar.

Bilmen gerekenler:
- İki tür geçiş vardır: giren parça baştan girer (çıkan parça geçişten sonra crossfade ile biter) veya giren parçanın güçlü bölümü (drop) çıkan parçanın bittiği anda devreye girer (öncesinde bir crossfade uzunluğunda giriş karışır, giren parçanın fazla girişi atılır).
- Öneriler çıkan parçanın son 110 saniyesinde aranır. Enerji, tempo ve vuruş analizi sentetik şarkılarla doğrulandı; gerçek müzikte öneri kalitesi değişebilir. Dinleyip beğenmezsen ⌘Z ile geri al.

## Kısayollar

Uygulama içinde `⌘/` ile tam liste açılır.

| Tuş | İşlem |
|---|---|
| Boşluk | Son tıklanan yerden oynat / durdur |
| ⇧ Boşluk | Durduğu yerden devam et |
| Return / Home / End | Başa dön / sona git |
| ← → | 1 sn geri / ileri (⇧ ile 5 sn) |
| S | Seçili parçayı oynatma çizgisinden böl |
| Q / W | Parçanın başını / sonunu oynatma çizgisine kırp |
| ⌘D | Parçayı çoğalt |
| ⌘A | Tüm parçaları seç |
| ⌘C / ⌘X / ⌘V | Kopyala / kes / yapıştır (oynatma çizgisine) |
| Sağ tık | Parça veya boş alan menüsü |
| Boş alanda sürükle | Dikdörtgenle toplu seçim (⇧ ile seçime ekle) |
| ⇧ + tıkla | Parçayı seçime ekle / çıkar |
| ⇧⌘S | Vokal / enstrüman ayır |
| ⇧⌘M | Tempo ve tonu eşleştir |
| ⌫ | Parçayı sil |
| ⌘Z / ⇧⌘Z | Geri al / yinele |
| ⌘O / ⌘E | Şarkı ekle / mix'i kaydet |
| ⌘S / ⌥⌘S | Projeyi kaydet / farklı kaydet |
| ⌥⌘O / ⌘N | Proje aç / yeni proje |
| ⌥ + kaydır | Parmaklar yukarı yakınlaştırır, aşağı uzaklaştırır (imlecin olduğu yerde) |
| Trackpad'de sıkıştır | Yakınlaştır / uzaklaştır |
| ⌃ + kaydır, ⇧ + kaydır | Sağa sola git |
| ⌘0 | Tümünü sığdır |
| Boş alana / cetvele / klibe tıkla | Oynatma çizgisini oraya taşır (çalarken de) |
| Süre sayacına tıkla | Saniye yazarak git (83 veya 1:23) |
| ⌘ basılıyken sürükle | Yapışmayı kapat |
| Sürgüye çift tıkla veya değerine tıkla | Varsayılan değere dön |

## Proje yapısı

```
src/main.js            Electron ana süreç: pencere, menü, dosya ve kaydetme penceresi, ses işlemleri
src/preload.js         Arayüz ile ana süreç arasındaki güvenli köprü
src/engine.js          Vokal / enstrüman ayırma motoru (Python yan servisi) yönetimi
src/tempo.js           Tempo / ton aracı (Rubber Band) yönetimi
src/pyenv.js           Python ortamı kurma ve süreç çalıştırma yardımcıları
src/saveformat.js      Kaydetme yolundan biçim çıkarma
src/projectfile.js     Proje dosyası ve yan ses dosyaları için güvenli (geçici dosya + yeniden adlandırma) yazma
src/renderer/          Arayüz: index.html, style.css, app.js (zaman çizelgesi, ses motoru), analysis.js (BPM / ton / enerji), transitions.js (geçiş önerileri)
tools/separate.py      Ayırma motorunu bellek sınırıyla başlatır
tools/stretch.py       Tempo / ton değiştirme (pedalboard / Rubber Band)
scripts/               Derleme ve ikon betikleri
```

Ses, Web Audio ile arayüzde çalınır ve kaydedilir; ağır işler (ayırma, tempo/ton) kullanıcı klasöründeki ayrı Python ortamlarında çalışır.

## Bilinen sınırlar

- Yalnızca macOS / Apple Silicon denendi. Vokal ayırma MLX gerektirdiği için Intel Mac ve diğer sistemlerde çalışmaz.
- Tempo ve ton tespiti gerçek müzikle geniş ölçekte denenmedi; ton tespiti özellikle tahminidir.
- Zamanlı geçişler form ile girilir; parçanın üstünde fareyle çekilen bir eğri yok.
- Proje dosyaları taşınabilir ama orijinal şarkılara dosya yoluyla bağlıdır; başka bilgisayara taşırken şarkıları da götür.
- Toplu seçimde yan panel birincil parçayı gösterir; seviye ve fade gibi ayarlar şimdilik yalnızca o parçaya uygulanır.

## Fikirler

- Zamanlı geçişleri parçanın üstünde fareyle çizme
- Toplu seçimde seviye ve fade gibi ayarları tüm seçili parçalara birden uygulama
- Geçiş önerilerinde değişken crossfade uzunluğu (8 / 16 / 32 vuruş)

## Lisans ve üçüncü parti notları

Harman'ın kendi kodu [MIT](LICENSE) lisanslıdır. Aşağıdakiler depoya ve uygulamaya konmaz; kullanıcı kendi bilgisayarına kurar veya indirir:

- **Ayırma modelleri:** BS-RoFormer ağırlıkları ticari olmayan kullanıma açıktır (CC-BY-NC-SA); Demucs ağırlıklarının lisansı belirsizdir. Kod tarafında `mlx-audio-separator` ve `demucs` MIT lisanslıdır.
- **Tempo / ton:** [pedalboard](https://github.com/spotify/pedalboard) içindeki Rubber Band ile yapılır; ikisi de GPL lisanslıdır. Harman bunları ayrı bir süreç olarak çalıştırır.
- **FFmpeg:** MP3 kodlama ve biçim dönüştürme için kullanıcının kendi kurulumu kullanılır.
