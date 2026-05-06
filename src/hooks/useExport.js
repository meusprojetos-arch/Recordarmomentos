/**
 * useExport — Hook para exportar memórias como ZIP organizado
 * 
 * Estrutura do ZIP gerado:
 *   Recordar_Export/
 *     2025/
 *       01_Janeiro/
 *         foto_titulo.jpg
 *     2024/
 *       ...
 *     INFO.txt
 */

import { useState, useCallback } from 'react'
import JSZip from 'jszip'
import toast from 'react-hot-toast'
import db from '../db/database.js'

export function useExport() {
  const [isExporting, setIsExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState(0)

  const MONTH_NAMES = [
    '01_Janeiro','02_Fevereiro','03_Março','04_Abril',
    '05_Maio','06_Junho','07_Julho','08_Agosto',
    '09_Setembro','10_Outubro','11_Novembro','12_Dezembro'
  ]

  const exportAll = useCallback(async () => {
    setIsExporting(true)
    setExportProgress(0)

    try {
      const memories = await db.memories.toArray()
      const profile  = await db.profile.toCollection().first()

      const zip = new JSZip()
      const root = zip.folder('Recordar_Export')

      // INFO.txt
      root.file('INFO.txt', [
        'RECORDAR — Exportação de Memórias',
        '=====================================',
        `Exportado em: ${new Date().toLocaleString('pt-BR')}`,
        `Titular: ${profile?.name || 'Usuário'}`,
        `Total de memórias: ${memories.length}`,
        '',
        'Suas memórias estão organizadas por ano e mês.',
        'Preserve este arquivo com carinho. 🌿',
      ].join('\n'))

      let done = 0
      for (const m of memories) {
        // Pasta por ano/mês
        const year  = m.date?.substring(0,4) || 'SemData'
        const month = m.date ? Number(m.date.substring(5,7)) - 1 : -1
        const monthFolder = month >= 0 ? MONTH_NAMES[month] : 'SemData'
        const folder = root.folder(year)?.folder(monthFolder)

        // Arquivo de mídia
        if (m.fileBlob && folder) {
          const ext  = m.fileBlob.type?.split('/')[1] || 'bin'
          const safe = (m.title || m.id).replace(/[^a-zA-Z0-9À-ÿ\s_-]/g,'').trim()
          folder.file(`${safe}.${ext}`, m.fileBlob)
        }

        // Nota de texto
        if (m.description || m.type === 'text') {
          const folder2 = root.folder(year)?.folder(monthFolder)
          const safe = (m.title || String(m.id)).replace(/[^a-zA-Z0-9À-ÿ\s_-]/g,'').trim()
          folder2?.file(`${safe}_nota.txt`, [
            m.title || '',
            m.date  || '',
            '',
            m.description || '',
          ].join('\n'))
        }

        done++
        setExportProgress(Math.round((done / memories.length) * 100))
      }

      // Gerar e baixar
      const blob = await zip.generateAsync({ type: 'blob' }, (meta) => {
        setExportProgress(Math.round(meta.percent))
      })

      const url  = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href     = url
      link.download = `Recordar_${new Date().toISOString().substring(0,10)}.zip`
      link.click()
      URL.revokeObjectURL(url)

      toast.success('📦 Exportação concluída!')
    } catch (err) {
      console.error(err)
      toast.error('Erro na exportação. Tente novamente.')
    } finally {
      setIsExporting(false)
      setExportProgress(0)
    }
  }, [])

  return { isExporting, exportProgress, exportAll }
}
