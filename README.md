# DirDelta Desktop

Electron ve TypeScript ile iki yönlü klasör karşılaştırma uygulaması. Arayüz Türkçedir; tüm işlemler bilgisayar üzerinde yapılır.

## Çalıştırma

```sh
npm install
npm start
```

Node.js ve Electron'un desteklediği bir masaüstü ortamı gerekir.

## Kullanım

1. Sol ve sağ klasörü seçin.
2. İsterseniz **SHA-256 ile doğrula** seçeneğini açın.
3. **Karşılaştır** düğmesine basın.
4. Her öğenin yanındaki okla o öğeyi diğer klasöre kopyalayın. Klasör oku, taranan alt öğeleri de kopyalar. **Eksikleri kopyala** düğmeleri, yalnızca kaynak tarafta bulunan öğeleri aktarır.

Liste yalnızca eksik, farklı veya türü çakışan öğeleri gösterir. İki tarafta bulunan üst klasörler, içlerinde fark olsa bile ayrıca listelenmez; farklar tam göreli yollarıyla gösterilir. Yalnızca bir tarafta bulunan klasörler ve dosya/klasör türü çakışmaları listelenmeye devam eder. Aynı veya hızlı modda aynı boyutta olan dosyalar, kökte ya da alt klasörlerde bulunmaları fark etmeksizin gizlenir. Görünür fark içermeyen klasörler de gizlenir. Arama farkların tam göreli yollarını kapsar. “Aynı / doğrulanmamış” sayacı yoktur; toplam öğe sayısı tüm taramayı kapsar.

**Gizli klasörleri ve dosyaları gizle** kutusu, noktayla başlayan dosyaları (`.env` gibi), klasörleri (`.git` gibi) ve alt içeriklerini listeden ve aramadan gizler. Varsayılan olarak kapalıdır ve yeniden tarama gerektirmez. Sayaçları, taramayı ve kopyalama kapsamını değiştirmez; Windows gizli özniteliğini temel almaz.

Tüm içeriği karşı tarafta eksik olan klasörler kapalı gösterilir; satıra tıklayarak açabilirsiniz. Klasörün kopyalama oku tüm taranan içeriği aktarır. Toplu kopyalama bütün karşılaştırmadaki eksikleri kapsar. Dosya adına tıklamak dosya yöneticisinde konumunu gösterir.

- **Hızlı mod:** Yol, tür ve dosya boyutu farklarını gösterir. Aynı boyutlu dosyalar listelenmez; içeriklerinin aynı olduğu varsayılmaz. Boyut farkı içeren klasörler görünür kalır.
- **SHA-256:** İki tarafta bulunan dosyaların tamamının içerikleri okunur ve hash'leri karşılaştırılır. Kopyalanan dosyanın içeriği de hedefe yerleştirilmeden önce doğrulanır. Büyük dosyalarda işlem daha uzun sürebilir.
- Gizli dosyalar ve boş klasörler dahildir. Sembolik bağlantılar ve özel dosyalar kopyalanmaz; “Dahil edilmeyen öğeler” bölümünde nedenleri açıklanır. Okuma hataları ayrı listelenir: öğenin tarafı ve yolu, hatanın nedeni ve önerilen çözüm gösterilir. “Sonuçlar eksik olabilir” yalnızca okuma hatasında belirtilir. SHA-256 sırasında okuma hatası olursa karşılaştırma durdurulur.
- Dosya/klasör türü çakışmaları otomatik çözülmez. Aynı veya iç içe kök klasörler kabul edilmez.
- Var olan dosyaların üzerine yazma, yerel onay penceresi gerektirir. Silme ve otomatik eşitleme yapılmaz.
- Dosyalar hedef klasörde geçici dosyaya yazılır; tamamlanınca hedefe yerleştirilir. Dosya değiştirme atomiktir, tüm toplu işlem tek bir işlem değildir. Hata veya iptal durumunda tamamlanan kopyalar kalır. Kopyalama sonrasında görünüm yeniden taranır.
- Kopyalama dosya içeriğini, standart izin bitlerini ve dosyanın zaman bilgilerini korur. ACL, genişletilmiş öznitelikler ve klasör zaman bilgileri korunmaz.
- Sonuçlar tarama anını yansıtır. İşlem sırasında başka uygulamalarla kaynak/hedef klasörlerini değiştirmeyin; harici değişiklikler için yeniden karşılaştırın.

## Geliştirme

```sh
npm run typecheck
npm test
npm run test:ui
```

Dosya sistemi erişimi ana süreçte, dar bir IPC arayüzü üzerinden yapılır. Renderer Node.js erişimi olmadan, sandbox ve context isolation açık çalışır. `src/engine.ts` mevcut motor API’sini koruyan dışa aktarım noktasıdır. `dirdelta_bash_script/` özgün komut satırı aracıdır.


### Kaynak kodu sorumlulukları

- `src/main.ts`: Electron başlangıcı, pencere oluşturma ve bağımlılıkların bağlanması.
- `src/desktop/ipc.ts`: IPC girdilerinin ve gönderen pencerenin doğrulanması; oturum komutlarına aktarılması.
- `src/application/`: Electron ve dosya sisteminden bağımsız karşılaştırma kuralları, bağımlılık sözleşmeleri ve pencere başına işlem oturumu.
- `src/filesystem/`: tarama, dosya okuma hataları, güvenli yol çözümleme, SHA-256 ve atomik dosya kopyalama.
- `src/types.ts`: katmanların paylaştığı salt okunur sonuçlar ve masaüstü API sözleşmesi.
- `src/renderer.ts`: kullanıcı eylemleri, ekran durumu ve API çağrıları.
- `src/presentation/view.ts`: sonuç satırları, sayaçlar ve uyarıların DOM çizimi.
- `src/tree.ts`: klasör gruplama, arama ve platformun yol ayırıcısına göre toplu seçim.

Uygulama katmanı altyapıyı içe aktarmaz; `main.ts` somut dosya sistemi işlemlerini oturuma geçirir. Oturum klasör seçimi dahil eşzamanlı komutları engeller, iptali sahiplenir ve pencere kapandığında sonlandırılır. Kopyalama başarılı, başarısız veya onaydan vazgeçilmiş olsa da karşılaştırma geçersizleşir; arayüz yeniden tarar.

Renderer sandbox içinde CommonJS yükleyicisi olmadan çalıştığı için tarayıcı kodu ad alanlarıyla derlenir. `index.html` yükleme sırası `tree`, `presentation/view`, `renderer` şeklindedir. Yeni bir paket veya derleme aracı gerekmez.

`npm test` dosya sistemi entegrasyonlarını, saf ağaç davranışını ve oturumun eşzamanlılık/iptal yaşam döngüsünü doğrular. `npm run test:ui` gerçek Electron penceresi, preload ve IPC üzerinden temel kullanıcı akışını çalıştırır; masaüstü oturumu gerektirir. Özgün Bash aracı bağımsızdır; sözdizimi `bash -n dirdelta_bash_script/dirdelta` ile kontrol edilebilir.
