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

Aynı göreli yollar iki bölmede hizalanır. Tüm içeriği karşı tarafta eksik olan klasörler kapalı gösterilir; satıra tıklayarak alt öğeleri açıp kapatabilirsiniz. Klasörün kopyalama oku tüm taranan içeriği aktarır. Arama kapalı klasörlerin içini de kapsar ve eşleşen yolları açarak gösterir. Sayaçlar, kapalı klasörlerin içindeki öğeler dahil tüm taramayı kapsar. Arama yalnızca görünümü etkiler; toplu kopyalama bütün karşılaştırmadaki eksikleri kapsar. Dosya adına tıklamak dosya yöneticisinde konumunu gösterir.

- **Hızlı mod:** Dosya boyutları farklıysa “Boyut farklı”; aynıysa “Doğrulanmadı” gösterilir. Aynı boyut, içeriğin aynı olduğunu kanıtlamaz.
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

Dosya sistemi erişimi ana süreçte, dar bir IPC arayüzü üzerinden yapılır. Renderer Node.js erişimi olmadan, sandbox ve context isolation açık çalışır. `src/engine.ts` tarama, SHA-256, yol kontrolleri ve kopyalama işlemlerini içerir. `dirdelta_bash_script/` özgün komut satırı aracıdır.
