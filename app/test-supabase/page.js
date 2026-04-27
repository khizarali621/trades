"use client";
import { useEffect, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabase';

export default function TestSupabase() {
  const [status, setStatus] = useState('Testing...');
  const [data, setData] = useState(null);

  useEffect(() => {
    async function test() {
      const client = getSupabaseClient();
      
      if (!client) {
        setStatus('❌ Supabase client not initialized - check .env.local');
        return;
      }

      try {
        // Test connection by fetching from table
        const { data, error } = await client
          .from('tds_state')
          .select('*')
          .limit(5);

        if (error) {
          setStatus(`❌ Error: ${error.message}`);
          console.error('Supabase error:', error);
        } else {
          setStatus('✅ Connected! Found ' + (data?.length || 0) + ' records');
          setData(data);
        }
      } catch (e) {
        setStatus(`❌ Exception: ${e.message}`);
        console.error('Exception:', e);
      }
    }

    test();
  }, []);

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Supabase Connection Test</h1>
        <div className="card mb-4">
          <h2 className="font-bold mb-2">Status:</h2>
          <p className="text-lg">{status}</p>
        </div>
        
        {data && (
          <div className="card">
            <h2 className="font-bold mb-2">Data:</h2>
            <pre className="text-xs bg-gray-100 p-4 rounded overflow-auto">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}

        <div className="mt-4">
          <a href="/" className="text-blue-600 hover:underline">← Back to App</a>
        </div>
      </div>
    </div>
  );
}
