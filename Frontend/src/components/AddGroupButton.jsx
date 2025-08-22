export default function AddGroupButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-10 right-10 bg-gradient-to-r from-pink-500 to-purple-500 
                 text-white text-3xl font-bold rounded-full w-14 h-14 
                 flex items-center justify-center shadow-lg hover:scale-110 
                 transition-transform duration-200 z-[400]"
    >
      +
    </button>
  );
}
