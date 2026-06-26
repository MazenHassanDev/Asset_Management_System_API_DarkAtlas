import { useEffect, useState } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import Topbar from './components/Topbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventory from './pages/Inventory.jsx';
import AssetDetail from './pages/AssetDetail.jsx';
import AssetForm from './pages/AssetForm.jsx';
import BulkImport from './pages/BulkImport.jsx';
import Quarantine from './pages/Quarantine.jsx';
import AIAnalysis from './pages/AIAnalysis.jsx';
import Relationships from './pages/Relationships.jsx';
import RelationshipView from './pages/RelationshipView.jsx';
import { api } from './api/client.js';

// Title/subtitle per route, matched in order (first hit wins).
const META = [
  [/^\/$/, ['Overview', 'Attack surface at a glance']],
  [/^\/assets\/new$/, ['New asset', 'Create or update an asset record']],
  [/^\/assets\/[^/]+\/edit$/, ['Edit asset', 'Create or update an asset record']],
  [/^\/assets\/[^/]+$/, ['Asset detail', 'Lifecycle, metadata and relationships']],
  [/^\/assets$/, ['Asset inventory', 'Filter, sort and drill into discovered assets']],
  [/^\/relationships\/[^/]+$/, ['Relationship graph', 'Linked assets and how they connect']],
  [/^\/relationships$/, ['Relationships', 'Pick an asset to map its connections']],
  [/^\/import$/, ['Bulk import', 'Ingest a scan export — idempotent and dedup-aware']],
  [/^\/quarantine$/, ['Quarantine', 'Rejected import rows, grouped by batch']],
  [/^\/ai$/, ['AI analysis', 'Natural-language queries grounded in your asset data']],
];

export default function App() {
  const { pathname } = useLocation();
  const [search, setSearch] = useState('');
  const [assetCount, setAssetCount] = useState(null);

  // keep the sidebar asset count fresh on navigation
  useEffect(() => {
    let alive = true;
    api.listAssets({ pageSize: 1, page: 1 }).then((r) => alive && setAssetCount(r.count)).catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const [title, subtitle] = (META.find(([re]) => re.test(pathname)) || [, ['', '']])[1];

  return (
    <div className="flex h-screen w-full bg-ink text-text text-sm overflow-hidden">
      <Sidebar assetCount={assetCount} />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar title={title} subtitle={subtitle} search={search} onSearch={setSearch} />
        <div className="flex-1 overflow-auto scroll-dark px-[30px] py-[26px]">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/assets" element={<Inventory search={search} setSearch={setSearch} />} />
            <Route path="/assets/new" element={<AssetForm />} />
            <Route path="/assets/:id/edit" element={<AssetForm />} />
            <Route path="/assets/:id" element={<AssetDetail />} />
            <Route path="/relationships" element={<Relationships />} />
            <Route path="/relationships/:id" element={<RelationshipView />} />
            <Route path="/import" element={<BulkImport />} />
            <Route path="/quarantine" element={<Quarantine />} />
            <Route path="/ai" element={<AIAnalysis />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
