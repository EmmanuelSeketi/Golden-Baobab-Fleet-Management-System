const navigationGroups = [
  { title: 'Workspace', items: [0, 1, 2, 3, 4, 5, 6, 7] },
  { title: 'Commercial', items: [0, 1, 2] },
  { title: 'Assets', items: [0, 1, 2] },
  { title: 'Governance', items: [0, 1, 2, 3] },
]

export default function Loading() {
  return (
    <div className="app-shell app-loading-shell" role="status" aria-label="Loading application">
      <aside className="sidebar app-loading-sidebar" aria-hidden="true">
        <div className="brand">
          <span className="skeleton-block app-loading-brand-logo" />
          <div className="app-loading-brand-copy">
            <span className="skeleton-block" />
            <span className="skeleton-block" />
          </div>
        </div>

        <nav className="app-loading-nav">
          {navigationGroups.map((group, groupIndex) => (
            <div className="nav-group app-loading-nav-group" key={group.title}>
              <div className="nav-group-toggle">
                <span className="skeleton-block" />
                <span className="skeleton-block app-loading-chevron" />
              </div>
              {group.items.map((item, itemIndex) => (
                <div
                  className={`nav-item${groupIndex === 0 && itemIndex === 0 ? ' active' : ''}`}
                  key={`${group.title}-${item}`}
                >
                  <span className="skeleton-block app-loading-nav-icon" />
                  <span className="skeleton-block" />
                </div>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-bottom app-loading-sidebar-bottom">
          <span className="skeleton-block" />
          <span className="skeleton-block" />
        </div>
      </aside>

      <div className="main-content">
        <header className="topbar app-loading-topbar" aria-hidden="true">
          <span className="skeleton-block app-loading-menu" />
          <div className="breadcrumb app-loading-breadcrumb">
            <span className="skeleton-block" />
            <span className="skeleton-block" />
          </div>
          <div className="top-actions app-loading-top-actions">
            <span className="skeleton-block app-loading-language" />
            <span className="skeleton-block app-loading-search" />
            <span className="skeleton-block app-loading-notification" />
            <span className="skeleton-block app-loading-account" />
          </div>
        </header>

        <main className="page-wrap app-loading-content" aria-hidden="true">
          <div className="app-loading-page-heading">
            <span className="skeleton-block app-loading-title" />
            <span className="skeleton-block app-loading-action" />
          </div>

          <div className="kpi-grid app-loading-kpis">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="kpi-card" key={index}>
                <span className="skeleton-block app-loading-kpi-icon" />
                <div className="app-loading-kpi-copy">
                  <span className="skeleton-block" />
                  <span className="skeleton-block" />
                  <span className="skeleton-block" />
                </div>
              </div>
            ))}
          </div>

          <div className="dashboard-grid app-loading-dashboard">
            <div className="panel">
              <div className="panel-header">
                <span className="skeleton-block app-loading-panel-title" />
                <span className="skeleton-block app-loading-control" />
              </div>
              <div className="loading-chart-skeleton">
                <div className="loading-chart-grid">
                  {[38, 64, 48, 82, 56, 72, 44].map((height, index) => (
                    <span className="loading-chart-bar" key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="panel app-loading-side-panel">
              <div className="panel-header">
                <span className="skeleton-block app-loading-panel-title" />
              </div>
              <div className="app-loading-side-content">
                <span className="skeleton-block app-loading-donut" />
                <div>
                  <span className="skeleton-block" />
                  <span className="skeleton-block" />
                  <span className="skeleton-block" />
                </div>
              </div>
            </div>
          </div>

          <div className="panel app-loading-table">
            <div className="panel-header">
              <span className="skeleton-block app-loading-panel-title" />
            </div>
            <div className="loading-skeleton loading-skeleton-table">
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {Array.from({ length: 6 }, (_, index) => (
                        <th key={index}>
                          <span className="skeleton-block" />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 4 }, (_, row) => (
                      <tr key={row}>
                        {Array.from({ length: 6 }, (_, column) => (
                          <td key={column}>
                            <span className="skeleton-block" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>
      <span className="visually-hidden">Loading your workspace…</span>
    </div>
  )
}
