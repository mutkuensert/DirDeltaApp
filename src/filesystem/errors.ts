export function explainReadError(error: unknown): { message: string; suggestion: string; code?: string } {
  const code = (error as NodeJS.ErrnoException | null)?.code
  switch (code) {
    case 'EACCES': case 'EPERM': return { code, message: 'Bu öğeye erişim izni yok.', suggestion: 'Dosya veya klasörün okuma izinlerini kontrol edip yeniden karşılaştırın.' }
    case 'ENOENT': return { code, message: 'Öğe tarama sırasında silinmiş, taşınmış veya bağlantısı kesilmiş olabilir.', suggestion: 'Öğenin hâlâ yerinde olduğunu kontrol edip yeniden karşılaştırın.' }
    case 'ENOTDIR': return { code, message: 'Klasör yolu artık geçerli değil; bir klasör taşınmış veya dosyayla değiştirilmiş olabilir.', suggestion: 'Klasör yapısını kontrol edip yeniden karşılaştırın.' }
    case 'EIO': return { code, message: 'Depolama aygıtı veriyi okuyamadı.', suggestion: 'Diskin durumunu ve bağlantısını kontrol edip yeniden deneyin.' }
    case 'ENODEV': case 'ENXIO': case 'ESTALE': case 'ENOTCONN': case 'ETIMEDOUT': case 'EHOSTUNREACH': case 'ENETUNREACH': return { code, message: 'Disk veya ağ konumuna erişilemiyor.', suggestion: 'Harici disk ya da ağ bağlantısını kontrol edip yeniden karşılaştırın.' }
    case 'EBUSY': return { code, message: 'Öğe şu anda kullanımda olduğu için okunamadı.', suggestion: 'Öğeyi kullanan işlemin bitmesini bekleyip yeniden deneyin.' }
    case 'EMFILE': case 'ENFILE': return { code, message: 'Sistemin aynı anda açabileceği dosya sınırına ulaşıldı.', suggestion: 'Gereksiz uygulamaları kapatıp yeniden deneyin.' }
    default: return { code, message: `Öğe okunamadı: ${error instanceof Error ? error.message : String(error)}`, suggestion: 'Yolu, erişim izinlerini ve disk bağlantısını kontrol edip yeniden karşılaştırın.' }
  }
}

