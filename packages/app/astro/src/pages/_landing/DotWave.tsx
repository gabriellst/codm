import { useEffect, useRef } from 'react'
import { BufferAttribute, BufferGeometry, PerspectiveCamera, Points, PointsMaterial, Scene, WebGLRenderer } from 'three'

interface Props {
	variant: 'hero' | 'cta'
	/** 0.4–2 — grid density multiplier */
	density?: number
	/** 0–4 — extra wave speed */
	speed?: number
}

/**
 * Decorative dot-wave field (founder prototype §3D). One THREE.Points grid whose
 * z-values are mutated per frame by a three-sine field. Vanilla three in a React
 * island (D2) — no @react-three/fiber; the reconciler buys nothing here.
 */
export default function DotWave({ variant, density = 1, speed = 0 }: Props) {
	const hostRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const host = hostRef.current
		if (!host) return

		const scene = new Scene()
		const w = host.clientWidth || 1
		const h = host.clientHeight || 1
		const camera = new PerspectiveCamera(50, w / h, 0.1, 100)
		camera.position.z = 8

		const renderer = new WebGLRenderer({ alpha: true, antialias: true })
		renderer.setSize(w, h)
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
		renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
		host.appendChild(renderer.domElement)

		const cols = Math.round(90 * density)
		const rows = Math.round(72 * density)
		const count = cols * rows
		const pos = new Float32Array(count * 3)
		let i = 0
		for (let x = 0; x < cols; x++) {
			for (let y = 0; y < rows; y++) {
				pos[i++] = (x / (cols - 1) - 0.5) * 22
				pos[i++] = (y / (rows - 1) - 0.5) * 20
				pos[i++] = 0
			}
		}
		const geometry = new BufferGeometry()
		geometry.setAttribute('position', new BufferAttribute(pos, 3))
		const dark = variant === 'cta'
		// WebGL material colors are numeric by necessity — matches the founder scene
		// (hero: near-black dots on white; cta: white dots on the dark card).
		const material = new PointsMaterial({
			color: dark ? 0xffffff : 0x161616,
			size: 0.035,
			transparent: true,
			opacity: dark ? 0.2 : 0.22,
		})
		const points = new Points(geometry, material)
		points.rotation.x = -1.12
		points.position.y = 0.2
		scene.add(points)

		let mx = 0
		let my = 0
		let t = 0
		let raf = 0
		let running = false

		const step = () => {
			t += 0.004 + speed * 0.01
			const p = geometry.attributes.position.array as Float32Array
			let j = 0
			for (let x = 0; x < cols; x++) {
				for (let y = 0; y < rows; y++) {
					const px = p[j]
					const py = p[j + 1]
					p[j + 2] = Math.sin(px * 0.55 + t) * 0.45 + Math.cos(py * 0.7 + t * 0.8) * 0.35 + Math.sin((px + py) * 0.3 + t * 0.5) * 0.3
					j += 3
				}
			}
			geometry.attributes.position.needsUpdate = true
			camera.position.x += (mx * 0.7 - camera.position.x) * 0.03
			camera.position.y += (-my * 0.5 - camera.position.y) * 0.03
			camera.lookAt(0, 0, 0)
			renderer.render(scene, camera)
		}

		const tick = () => {
			step()
			raf = requestAnimationFrame(tick)
		}
		const start = () => {
			if (running) return
			running = true
			raf = requestAnimationFrame(tick)
		}
		const stop = () => {
			if (!running) return
			running = false
			cancelAnimationFrame(raf)
		}

		const onMouse = (e: MouseEvent) => {
			mx = e.clientX / innerWidth - 0.5
			my = e.clientY / innerHeight - 0.5
		}
		const onResize = () => {
			const W = host.clientWidth || 1
			const H = host.clientHeight || 1
			camera.aspect = W / H
			camera.updateProjectionMatrix()
			renderer.setSize(W, H)
		}

		const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
		let observer: IntersectionObserver | undefined

		if (reducedMotion) {
			// One static frame — no rAF, no listeners beyond resize.
			step()
			addEventListener('resize', onResize)
		} else {
			addEventListener('mousemove', onMouse)
			addEventListener('resize', onResize)
			// Pause the loop while the host is offscreen; resume when visible.
			observer = new IntersectionObserver(entries => {
				for (const entry of entries) {
					if (entry.isIntersecting) start()
					else stop()
				}
			})
			observer.observe(host)
			start()
		}

		return () => {
			stop()
			observer?.disconnect()
			removeEventListener('resize', onResize)
			removeEventListener('mousemove', onMouse)
			geometry.dispose()
			material.dispose()
			renderer.dispose()
			host.removeChild(renderer.domElement)
		}
	}, [variant, density, speed])

	return <div ref={hostRef} aria-hidden="true" className="pointer-events-none absolute inset-0" />
}
