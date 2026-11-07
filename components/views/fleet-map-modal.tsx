'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { PieChart } from '@mui/x-charts/PieChart'
import { LocateFixed, MapPin, Minus, Plus } from 'lucide-react'
import { LoadingSpinner, Modal } from '@/components/shared'

export type FleetMapMachine = {
  name?: string
  machine_number: string
  project: { name: string; site_location: string | null } | null
}

type Site = {
  location: string
  machines: FleetMapMachine[]
}

type GeocodedSite = Site & {
  latitude: number
  longitude: number
}

type MapSize = { width: number; height: number }
type GeocodeResult = { latitude: number; longitude: number } | null

const geocodeCache = new Map<string, GeocodeResult>()
const TILE_SIZE = 256
export const FLEET_SITE_COLORS = ['#20c997', '#29b6f6', '#ffc857', '#ff6b6b', '#b388ff', '#4dd0e1']
const ZAMBIA_BOUNDARY: readonly [number, number][] = [
  [22.00, -16.21], [23.43, -17.64], [24.71, -17.50], [25.92, -18.00],
  [27.04, -17.96], [27.82, -16.98], [28.82, -16.49], [28.93, -15.95],
  [29.57, -15.64], [30.42, -15.62], [30.22, -15.00], [33.24, -14.00],
  [33.03, -14.06], [32.67, -13.62], [33.02, -13.21], [33.02, -12.65],
  [33.55, -12.37], [33.26, -12.14], [33.40, -11.16], [33.24, -10.89],
  [33.71, -10.57], [33.37, -9.86], [32.96, -9.40], [31.08, -8.62],
  [30.80, -8.28], [29.00, -8.46], [28.37, -9.26], [28.70, -9.80],
  [28.70, -10.67], [28.39, -11.59], [29.04, -12.38], [29.48, -12.46],
  [29.48, -12.25], [29.81, -12.15], [29.73, -13.46], [29.59, -13.20],
  [29.01, -13.42], [28.45, -12.52], [27.62, -12.27], [27.21, -11.56],
  [26.88, -11.98], [25.98, -11.95], [25.33, -11.63], [25.35, -11.20],
  [24.44, -11.47], [24.38, -11.09], [24.00, -10.89], [24.08, -12.38],
  [23.89, -12.84], [24.06, -13.00], [22.00, -13.00], [22.00, -16.21],
]

function projectCoordinates(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom
  const sinLatitude = Math.sin((latitude * Math.PI) / 180)
  return {
    x: ((longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (4 * Math.PI)) * scale,
  }
}

function fitZoom(sites: GeocodedSite[], size: MapSize, includeZambiaBoundary: boolean) {
  if (size.width <= 0 || size.height <= 0) return 10
  if (!includeZambiaBoundary && sites.length === 1) return 13
  if (!includeZambiaBoundary && sites.length === 0) return 10
  const points = [
    ...sites.map((site) => projectCoordinates(site.latitude, site.longitude, 0)),
    ...(includeZambiaBoundary
      ? ZAMBIA_BOUNDARY.map(([longitude, latitude]) => projectCoordinates(latitude, longitude, 0))
      : []),
  ]
  const spreadX = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x))
  const spreadY = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y))
  for (let zoom = 18; zoom >= 2; zoom--) {
    const scale = 2 ** zoom
    if (spreadX * scale <= size.width - 112 && spreadY * scale <= size.height - 112) return zoom
  }
  return 2
}

async function geocode(location: string): Promise<GeocodeResult> {
  const cached = geocodeCache.get(location)
  if (cached !== undefined) return cached

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(location)}`,
    { headers: { Accept: 'application/json' } },
  )
  if (!response.ok) throw new Error(`Location lookup failed (${response.status}).`)

  const results: { lat: string; lon: string }[] = await response.json()
  const result =
    results.length > 0
      ? { latitude: Number(results[0].lat), longitude: Number(results[0].lon) }
      : null
  geocodeCache.set(location, result)
  return result
}

export function FleetMapModal(
  props:
    | { machines: FleetMapMachine[]; inline: true; maxZoom?: number; focusLocation?: boolean }
    | { machines: FleetMapMachine[]; open: boolean; onClose: () => void; inline?: false; maxZoom?: number },
) {
  const machines = props.machines
  const inline = props.inline === true
  const focusLocation = inline && props.focusLocation === true
  const maxZoom = props.maxZoom ?? 18
  const open = inline || ('open' in props && props.open)
  const [geocoded, setGeocoded] = useState<GeocodedSite[]>([])
  const [unlocated, setUnlocated] = useState<FleetMapMachine[]>([])
  const [failed, setFailed] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [mapSize, setMapSize] = useState<MapSize>({ width: 800, height: 400 })
  const [mapZoom, setMapZoom] = useState<number | null>(null)
  const [mapLayer, setMapLayer] = useState<'street' | 'satellite'>('street')
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null)
  const [lookupError, setLookupError] = useState('')
  const mapElement = useRef<HTMLDivElement | null>(null)
  const active = inline || open
  const dragStart = useRef<{
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
  } | null>(null)

  const sites = useMemo(() => {
    const grouped = new Map<string, Site>()
    const withoutLocation: FleetMapMachine[] = []
    for (const machine of machines) {
      const location = machine.project?.site_location?.trim()
      if (!location) {
        withoutLocation.push(machine)
        continue
      }
      const key = location.toLocaleLowerCase()
      const existing = grouped.get(key)
      if (existing) existing.machines.push(machine)
      else grouped.set(key, { location, machines: [machine] })
    }
    return { sites: Array.from(grouped.values()), withoutLocation }
  }, [machines])

  useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    let cancelled = false

    async function loadSites() {
      setLoading(true)
      setGeocoded([])
      setUnlocated(sites.withoutLocation)
      setFailed([])
      setLookupError('')
      setSelectedLocation(null)
      const located: GeocodedSite[] = []
      const failedLocations: string[] = []

      try {
        for (let index = 0; index < sites.sites.length; index++) {
          if (cancelled) return
          const site = sites.sites[index]
          try {
            const result = await geocode(site.location)
            if (result) located.push({ ...site, ...result })
            else failedLocations.push(site.location)
          } catch (error) {
            if (controller.signal.aborted) return
            failedLocations.push(site.location)
            setLookupError(error instanceof Error ? error.message : 'A location lookup failed.')
          }
          if (!cancelled) {
            setGeocoded([...located])
            setFailed([...failedLocations])
          }
          if (index < sites.sites.length - 1 && !geocodeCache.has(sites.sites[index + 1].location)) {
            await new Promise((resolve) => window.setTimeout(resolve, 1100))
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSites()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [active, sites])

  useEffect(() => {
    if (!active) return
    setMapZoom(null)
    setPanOffset({ x: 0, y: 0 })
  }, [active])

  useEffect(() => {
    const element = mapElement.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      setMapSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [active, geocoded.length])

  const zoom = Math.min(maxZoom, Math.max(2, mapZoom ?? fitZoom(geocoded, mapSize, !focusLocation)))
  const points = geocoded.map((site) => ({
    site,
    ...projectCoordinates(site.latitude, site.longitude, zoom),
  }))
  const siteChartData = [...sites.sites]
    .sort((a, b) => a.location.localeCompare(b.location))
    .map((site, index) => ({
      label: site.location,
      value: site.machines.length,
      color: FLEET_SITE_COLORS[index % FLEET_SITE_COLORS.length],
    }))
  const outlinePoints = ZAMBIA_BOUNDARY.map(([longitude, latitude]) =>
    projectCoordinates(latitude, longitude, zoom),
  )
  const siteCenter = points.length
    ? {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      }
    : projectCoordinates(-13.1339, 27.8493, zoom)
  const center = mapZoom === null && !focusLocation
    ? {
        x: (Math.min(...outlinePoints.map((point) => point.x)) + Math.max(...outlinePoints.map((point) => point.x))) / 2,
        y: (Math.min(...outlinePoints.map((point) => point.y)) + Math.max(...outlinePoints.map((point) => point.y))) / 2,
      }
    : siteCenter
  const left = center.x - mapSize.width / 2 - panOffset.x
  const top = center.y - mapSize.height / 2 - panOffset.y
  const tileXStart = Math.floor(left / TILE_SIZE)
  const tileYStart = Math.floor(top / TILE_SIZE)
  const tileColumns = Math.ceil(mapSize.width / TILE_SIZE) + 2
  const tileRows = Math.ceil(mapSize.height / TILE_SIZE) + 2
  const worldTileCount = 2 ** zoom
  const tiles = []
  for (let row = 0; row < tileRows; row++) {
    for (let column = 0; column < tileColumns; column++) {
      const x = tileXStart + column
      const y = tileYStart + row
      if (y < 0 || y >= worldTileCount) continue
      const wrappedX = ((x % worldTileCount) + worldTileCount) % worldTileCount
      tiles.push({
        key: `${mapLayer}-${zoom}-${x}-${y}`,
        x: x * TILE_SIZE - left,
        y: y * TILE_SIZE - top,
        url: mapLayer === 'satellite'
          ? `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${wrappedX}`
          : `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`,
      })
    }
  }

  function changeZoom(delta: number) {
    setMapZoom((current) => Math.min(maxZoom, Math.max(2, (current ?? zoom) + delta)))
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button, a')) return
    dragStart.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: panOffset.x,
      originY: panOffset.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragStart.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setPanOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (dragStart.current?.pointerId !== event.pointerId) return
    dragStart.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const content = (
    <>
      {!inline ? (
        <div className="fleet-map-summary">
          <div className="fleet-map-summary-cards">
            <div><span>Machines</span><b>{machines.length}</b></div>
            <div><span>Project sites</span><b>{sites.sites.length}</b></div>
            <div><span>Mapped sites</span><b>{geocoded.length}</b></div>
            <div><span>Not mapped</span><b>{unlocated.length + sites.sites
              .filter((site) => failed.includes(site.location))
              .reduce((total, site) => total + site.machines.length, 0)}</b></div>
          </div>
          {sites.sites.length > 0 ? (
            <div className="dashboard-map-summary fleet-map-sites">
              <div className="dashboard-map-summary-layout">
                <PieChart
                  className="dashboard-site-chart"
                  series={[{
                    innerRadius: 30,
                    outerRadius: 100,
                    paddingAngle: 5,
                    cornerRadius: 5,
                    startAngle: -45,
                    endAngle: 225,
                    cx: 150,
                    cy: 150,
                    data: siteChartData,
                    arcLabel: 'value',
                    arcLabelMinAngle: 15,
                  }]}
                  width={300}
                  height={300}
                  hideLegend
                />
                <ul className="dashboard-site-legend">
                  {siteChartData.map((site) => (
                    <li key={site.label}>
                      <i
                        className="dashboard-site-dot"
                        style={{ backgroundColor: site.color }}
                        aria-hidden="true"
                      />
                      <span>{site.label} · {site.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      {loading && geocoded.length === 0 ? (
        <div className="fleet-map-loading">
          <LoadingSpinner />
          <span>Looking up project locations…</span>
        </div>
      ) : null}
      {lookupError ? <p className="fleet-map-message error">{lookupError}</p> : null}
      {geocoded.length > 0 ? (
        <div
          className="fleet-map-canvas"
          ref={mapElement}
          role="region"
          aria-label="Map of fleet locations"
          onWheel={(event) => {
            event.preventDefault()
            changeZoom(event.deltaY < 0 ? 1 : -1)
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {tiles.map((tile) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={tile.key}
              className="fleet-map-tile"
              src={tile.url}
              alt=""
              style={{ left: tile.x, top: tile.y }}
            />
          ))}
          {!focusLocation ? (
            <svg
              className="fleet-map-country-outline"
              width={mapSize.width}
              height={mapSize.height}
              aria-hidden="true"
            >
              <path
                d={`${outlinePoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x - left} ${point.y - top}`).join(' ')} Z`}
              />
            </svg>
          ) : null}
          {points.map(({ site, x, y }) => {
            const locationKey = site.location.toLocaleLowerCase()
            const selected = selectedLocation === locationKey
            return (
              <div
                className="fleet-map-marker-wrap"
                key={locationKey}
                style={{ left: x - left, top: y - top }}
              >
                <button
                  type="button"
                  className="fleet-map-marker"
                  aria-label={`${site.location}: ${site.machines.length} ${site.machines.length === 1 ? 'machine' : 'machines'}`}
                  onClick={() => setSelectedLocation(selected ? null : locationKey)}
                >
                  <MapPin size={18} />
                  {site.machines.length > 1 ? <span>{site.machines.length}</span> : null}
                </button>
                {selected ? (
                  <div className="fleet-map-popup">
                    <b>{site.location}</b>
                    {site.machines.map((machine) => (
                      <span key={machine.machine_number}>{machine.name ? `${machine.name} · ${machine.machine_number}` : machine.machine_number}</span>
                    ))}
                  </div>
                ) : null}
              </div>
            )
          })}
          <div className="fleet-map-layer-toggle" role="group" aria-label="Map layer">
            <button
              type="button"
              aria-pressed={mapLayer === 'street'}
              onClick={() => setMapLayer('street')}
            >
              Street
            </button>
            <button
              type="button"
              aria-pressed={mapLayer === 'satellite'}
              onClick={() => setMapLayer('satellite')}
            >
              Satellite
            </button>
          </div>
          <div className="fleet-map-controls" aria-label="Map controls">
            <button type="button" aria-label="Zoom in" onClick={() => changeZoom(1)} disabled={zoom >= maxZoom}>
              <Plus size={18} />
            </button>
            <button type="button" aria-label="Zoom out" onClick={() => changeZoom(-1)} disabled={zoom <= 2}>
              <Minus size={18} />
            </button>
            <button
              type="button"
              aria-label="Reset map view"
              onClick={() => {
                setMapZoom(null)
                setPanOffset({ x: 0, y: 0 })
              }}
            >
              <LocateFixed size={17} />
            </button>
          </div>
          <a
            className="fleet-map-attribution"
            href={mapLayer === 'satellite'
              ? 'https://www.esri.com/en-us/legal/terms/full-master-agreement'
              : 'https://www.openstreetmap.org/copyright'}
            target="_blank"
            rel="noreferrer"
          >
            {mapLayer === 'satellite'
              ? 'Imagery © Esri, Maxar, Earthstar Geographics · Boundary © OpenStreetMap'
              : '© OpenStreetMap contributors'}
          </a>
        </div>
      ) : null}
      {!loading && geocoded.length === 0 && failed.length === 0 && unlocated.length === 0 ? (
        <p className="fleet-map-message">No machines are available to display.</p>
      ) : null}
      {failed.length > 0 || unlocated.length > 0 ? (
        <div className="fleet-map-unlocated">
          <b>Locations not shown on map</b>
          {failed.map((location) => (
            <span key={location}>Could not find a map location for {location}.</span>
          ))}
          {unlocated.map((machine) => (
            <span key={machine.machine_number}>
              {machine.name ? `${machine.name} (${machine.machine_number})` : machine.machine_number}: no current project site location.
            </span>
          ))}
        </div>
      ) : null}
    </>
  )

  if (props.inline === true) {
    return <div className={`fleet-map-inline${focusLocation ? ' fleet-map-focused' : ''}`}>{content}</div>
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Fleet Map"
      subtitle="Approximate project locations. Scroll to zoom, drag to pan, or use the map controls."
    >
      {content}
    </Modal>
  )
}
