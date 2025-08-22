export default function GroupCard({ onClose, qrCode, groupId }) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[500]">
      <div className="relative bg-purple-400/90 backdrop-blur-md p-6 rounded-2xl shadow-xl w-[320px] text-center">
        {/* Close (X) Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-white text-lg font-bold hover:text-gray-200"
        >
          ✕
        </button>

        <h2 className="text-lg font-bold mb-4 text-white">
          Share this QR to join the group
        </h2>

        {qrCode ? (
          <img src={qrCode} alt="QR Code" className="mx-auto mb-4 rounded-lg shadow-md" />
        ) : (
          <p className="text-center text-white">Loading QR...</p>
        )}

        <p className="text-white font-mono mb-4">Group Code: {groupId}</p>

        <div className="flex justify-center gap-3">
          <button className="px-4 py-2 rounded-full bg-pink-500 text-white hover:bg-pink-600 transition">
            SHARE
          </button>
          <button
            onClick={() =>
              navigator.clipboard.writeText("http://example-joingroup.com")
            }
            className="px-4 py-2 rounded-full bg-gray-800 text-white hover:bg-gray-900 transition"
          >
            COPY
          </button>
        </div>
      </div>
    </div>
  );
}
