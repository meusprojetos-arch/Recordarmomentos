/**
 * LazyImage — carrega imagem só quando entra (ou se aproxima) do viewport.
 * Resistente a re-renders do pai (não pisca quando o componente envolvente
 * re-renderiza por mudança de classe/seleção, etc).
 *
 * Truque: a função `src` (resolver) só é executada UMA vez. Mudanças posteriores
 * de identidade da função (a função muda mas resolve o mesmo URL) são ignoradas.
 */
import React, { useEffect, useRef, useState } from 'react'

export default function LazyImage({
  src,
  placeholder = null,
  alt = '',
  className = '',
  style = {},
  onClick,
  rootMargin = '500px',
  eager = false,
  ...rest
}) {
  const ref = useRef(null)
  const [resolvedSrc, setResolvedSrc] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [errored, setErrored] = useState(false)
  const generatedUrlRef = useRef(null)
  const hasLoadedRef = useRef(false) // ← garante que o resolver roda só 1 vez

  // Mantém o src atual numa ref (sem disparar re-effect)
  const srcRef = useRef(src)
  srcRef.current = src

  useEffect(() => {
    if (!ref.current) return
    // Se já carregou antes, NÃO recarrega (evita flicker em re-render do pai)
    if (hasLoadedRef.current) return

    let cancelled = false

    const load = async () => {
      if (cancelled || hasLoadedRef.current) return
      hasLoadedRef.current = true
      try {
        const currentSrc = srcRef.current
        let url
        if (typeof currentSrc === 'function') {
          url = await currentSrc()
        } else {
          url = currentSrc
        }
        if (cancelled) return
        if (!url) { setErrored(true); return }

        if (typeof url === 'string' && url.startsWith('blob:')) {
          generatedUrlRef.current = url
        }
        setResolvedSrc(url)
      } catch (e) {
        if (!cancelled) setErrored(true)
      }
    }

    if (eager) {
      load()
      return () => { cancelled = true }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          load()
          observer.disconnect()
        }
      },
      { rootMargin }
    )
    observer.observe(ref.current)

    return () => {
      cancelled = true
      observer.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // ← roda só na MONTAGEM, nunca em re-render

  // Cleanup do objectURL apenas no UNMOUNT real do componente
  useEffect(() => {
    return () => {
      if (generatedUrlRef.current) {
        try { URL.revokeObjectURL(generatedUrlRef.current) } catch {}
        generatedUrlRef.current = null
      }
    }
  }, [])

  const baseStyle = {
    background: '#e8e3d8',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    transition: 'opacity 0.25s ease',
    opacity: loaded ? 1 : 0,
    ...style,
  }

  if (errored) {
    return (
      <div
        ref={ref}
        className={className}
        onClick={onClick}
        style={{ ...baseStyle, opacity: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: '#aaa' }}
      >
        🖼️
      </div>
    )
  }

  return (
    <div
      ref={ref}
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
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          style={baseStyle}
          {...rest}
        />
      )}
    </div>
  )
}
