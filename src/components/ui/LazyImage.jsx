/**
 * LazyImage — versão definitiva, sem flicker e rápida.
 *
 * Estratégia:
 *  1. CACHE GLOBAL (Map fora do componente) — uma URL resolvida pra cada cacheKey.
 *     Se o componente desmontar e remontar (re-render do pai, troca de array),
 *     a URL é pega instantaneamente do cache: zero flicker, zero re-fetch.
 *
 *  2. SEM IntersectionObserver. Usa `loading="lazy"` HTML nativo, que o browser
 *     gerencia em C++ (muito mais eficiente que JS observers em centenas de items).
 *
 *  3. Resolver SÓ roda 1 vez por cacheKey (idempotente).
 */
import React, { useEffect, useRef, useState } from 'react'

// Cache global: cacheKey (ex: memory.id) → URL resolvida.
// Persiste enquanto o app estiver aberto.
const _urlCache = new Map()
// Promessas em andamento (pra não chamar resolver 2x pro mesmo key em paralelo)
const _pendingResolvers = new Map()

export function clearLazyImageCache() {
  _urlCache.clear()
  _pendingResolvers.clear()
}

export default function LazyImage({
  src,
  cacheKey,          // identificador estável (ex: memory.id) — habilita o cache global
  placeholder = null,
  alt = '',
  className = '',
  style = {},
  onClick,
  ...rest
}) {
  // Inicializa com URL do cache se já tiver — ZERO flicker em remount
  const [resolvedSrc, setResolvedSrc] = useState(() => {
    if (cacheKey && _urlCache.has(cacheKey)) return _urlCache.get(cacheKey)
    if (typeof src === 'string') return src
    return null
  })
  const [loaded, setLoaded] = useState(() => !!resolvedSrc)
  const [errored, setErrored] = useState(false)

  // Mantém src atualizado em ref (não dispara re-effect)
  const srcRef = useRef(src)
  srcRef.current = src

  useEffect(() => {
    if (resolvedSrc) return // já resolvido (cache ou string direta)

    let cancelled = false

    const resolve = async () => {
      try {
        // Se outra instância já está resolvendo o mesmo cacheKey, espera
        if (cacheKey && _pendingResolvers.has(cacheKey)) {
          const url = await _pendingResolvers.get(cacheKey)
          if (!cancelled && url) setResolvedSrc(url)
          return
        }

        const promise = (async () => {
          const s = srcRef.current
          if (typeof s === 'function') return await s()
          return s
        })()

        if (cacheKey) _pendingResolvers.set(cacheKey, promise)

        const url = await promise

        if (cacheKey) {
          if (url) _urlCache.set(cacheKey, url)
          _pendingResolvers.delete(cacheKey)
        }

        if (cancelled) return
        if (!url) { setErrored(true); return }
        setResolvedSrc(url)
      } catch {
        if (cacheKey) _pendingResolvers.delete(cacheKey)
        if (!cancelled) setErrored(true)
      }
    }

    resolve()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey])

  const baseImgStyle = {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    ...style,
  }

  if (errored) {
    return (
      <div
        className={className}
        onClick={onClick}
        style={{ ...baseImgStyle, background: '#e8e3d8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#aaa' }}
      >
        🖼️
      </div>
    )
  }

  return (
    <div
      onClick={onClick}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#e8e3d8',
        ...style,
      }}
    >
      {!loaded && placeholder}
      {resolvedSrc && (
        <img
          src={resolvedSrc}
          alt={alt}
          loading="lazy"      // HTML nativo — browser decide quando baixar
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={baseImgStyle}
          {...rest}
        />
      )}
    </div>
  )
}
