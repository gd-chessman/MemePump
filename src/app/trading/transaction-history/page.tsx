"use client"

import { getOrderHistories, getOrderMyHistories } from "@/services/api/OnChainService"
import { getInforWallet } from "@/services/api/TelegramWalletService"
import { formatNumberWithSuffix, truncateString } from "@/utils/format"
import { useQuery } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { useState, Suspense, useEffect } from "react"
import { io as socketIO } from "socket.io-client"

type Transaction = {
  time: string
  type: "BUY" | "SELL"
  price: string
  amount: string
  total: string
  source: string
  hash: string
  status: "COMPLETED" | "PENDING" | "FAILED"
  address: string
}

export default function TransactionHistory() {
  return (
    <Suspense fallback={<div></div>}>
      <TransactionHistoryContent />
    </Suspense>
  )
}

function TransactionHistoryContent() {
  const [activeTab, setActiveTab] = useState<"all" | "my">("all")
  const [socket, setSocket] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [realTimeTransactions, setRealTimeTransactions] = useState<any[]>([]);
  
  const searchParams = useSearchParams();
  const address = searchParams?.get("address");

  // WebSocket connection setup
  useEffect(() => {
    if (typeof window === 'undefined' || !address) return;

    const socketInstance = socketIO(`${process.env.NEXT_PUBLIC_API_URL}/token-txs`, {
      path: '/socket.io',
      transports: ['websocket'],
    });

    socketInstance.on('connect', () => {
      console.log('Connected to WebSocket server');
      setIsConnected(true);
      setError(null);
      socketInstance.emit('subscribe', { tokenAddress: address });
    });

    socketInstance.on('disconnect', () => {
      console.log('Disconnected from WebSocket server');
      setIsConnected(false);
    });

    socketInstance.on('error', (error) => {
      console.error('WebSocket error:', error);
      setError(error.message);
    });

    socketInstance.on('transaction', (transaction: any) => {
      setRealTimeTransactions((prev) => [transaction, ...prev].slice(0, 50));
    });

    socketInstance.on('subscribed', (data) => {
      console.log('Subscribed to token:', data.tokenAddress);
    });

    setSocket(socketInstance);

    return () => {
      if (socketInstance) {
        socketInstance.emit('unsubscribe', { tokenAddress: address });
        socketInstance.disconnect();
      }
    };
  }, [address]);

  const { data: orderHistories, isLoading: isLoadingOrderHistories, refetch: refetchOrderHistories } = useQuery(
    {
      queryKey: ["orderHistories", address],
      queryFn: () =>
        getOrderHistories({
          address: address || "",
          offset: 0,
          limit: 100,
          sort_by: "block_unix_time",
          sort_type: "desc",
          tx_type: "swap",
        }),
      enabled: !!address,
    }
  );
  const { data: walletInfor, refetch } = useQuery({
    queryKey: ["wallet-infor"],
    queryFn: getInforWallet,
});


  const { data: orderMyHistories, refetch: refetchOrderMyHistories } = useQuery({
    queryKey: ["orderMyHistories", address],
    queryFn: () => getOrderMyHistories(String(address), String(walletInfor?.solana_address)),
    enabled: !!walletInfor,
  });

  // Add state to store combined my transactions
  const [combinedMyTransactions, setCombinedMyTransactions] = useState<any[]>([]);
  // Effect to handle updating my transactions when orderHistories changes
  useEffect(() => {
    if (!orderHistories || !walletInfor?.solana_address) return;

    // Filter new transactions for my wallet
    const newMyTransactions = orderHistories.filter((item: any) => {
      // Log each item's wallet for debugging
      return item.wallet === walletInfor.solana_address;
    });

    console.log("Filtered my transactions:", newMyTransactions);

    // Combine with existing orderMyHistories and remove duplicates
    const existingTransactions = orderMyHistories || [];
    
    // Sort both arrays by time before combining to ensure proper order
    const sortByTime = (a: any, b: any) => {
      const timeA = new Date(a.time).getTime();
      const timeB = new Date(b.time).getTime();
      return timeB - timeA; // Descending order (newest first)
    };

    const sortedExisting = [...existingTransactions].sort(sortByTime);
    const sortedNew = [...newMyTransactions].sort(sortByTime);
    
    // Combine sorted arrays
    const allTransactions = [...sortedNew, ...sortedExisting];
    
    // Remove duplicates based on transaction hash (tx)
    const uniqueTransactions = allTransactions.reduce((acc: any[], current: any) => {
      const exists = acc.find(item => item.tx === current.tx);
      if (!exists) {
        acc.push(current);
      }
      return acc;
    }, []);

    // Final sort to ensure proper time order
    const finalSortedTransactions = uniqueTransactions.sort(sortByTime);

    setCombinedMyTransactions(finalSortedTransactions);
  }, [orderHistories, orderMyHistories, walletInfor?.solana_address]);


  // Get the first transaction price
  const lastTransactionPrice = orderHistories && orderHistories.length > 0 
    ? orderHistories[0]?.token?.from?.price?.usd 
    : undefined;

  // Dispatch event when lastTransactionPrice changes
  useEffect(() => {
    if (typeof window !== 'undefined' && lastTransactionPrice !== undefined) {
      const event = new CustomEvent('lastTransactionPriceUpdate', {
        detail: { 
          price: lastTransactionPrice,
          tokenAddress: address 
        }
      });
      window.dispatchEvent(event);
    }
  }, [lastTransactionPrice, address]);

  // Combine historical and real-time transactions
  const allTransactions = [
    ...(realTimeTransactions || []),
    ...(orderHistories || [])
  ];

  const formatPrice = (price: number | undefined) => {
    if (price === undefined) return '0.0';
    return price?.toFixed(6);
};

  const renderAllTransactionsTable = () => (
    <table className="w-full text-sm table-fixed">
      <thead className="sticky top-0 z-10 bg-white dark:bg-[#0F0F0F]">
        <tr className="border-b border-gray-200 dark:border-neutral-800">
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[15%]">Time</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[8%]">Type</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[10%]">Price</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[8%]">Amount</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[10%]">Total</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[8%]">Source</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[15%]">Transaction Hash</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[10%]">Status</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[16%]">Address</th>
        </tr>
      </thead>
      <tbody>
        {allTransactions?.map((order: any, index: number) => (
          <tr key={index} className="hover:bg-gray-100 dark:hover:bg-neutral-800/30 border-b border-gray-100 dark:border-neutral-800/50">
            <td className="px-4 py-2 truncate text-gray-600 dark:text-neutral-300">
              {new Date(order.time).toLocaleString()}
            </td>
            <td className={`px-4 text-xs py-2 font-medium truncate ${order.type === "buy" ? "text-green-600 dark:text-green-500 uppercase" : "text-red-600 dark:text-red-500 uppercase"}`}>
              {order.type}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              ${formatPrice(order.priceUsd)}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              {formatNumberWithSuffix(order.amount)}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              ${(order.priceUsd * order.amount).toFixed(6)}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              {order.program}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              {order.tx}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              COMPLETED
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium flex items-center truncate">
              {truncateString(order.wallet, 10)}
              <button className="ml-1 text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const renderMyTransactionsTable = () => (
    <table className="w-full text-sm table-fixed">
      <thead className="sticky top-0 z-10 bg-white dark:bg-[#0F0F0F]">
        <tr className="border-b border-gray-200 dark:border-neutral-800">
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[15%]">Time</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[8%]">Type</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[10%]">Price</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[8%]">Amount</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[10%]">Total</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[8%]">Source</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[15%]">Transaction Hash</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[10%]">Status</th>
          <th className="px-4 py-2 text-left text-gray-700 dark:text-neutral-200 font-medium w-[16%]">Address</th>
        </tr>
      </thead>
      <tbody>
        {combinedMyTransactions?.map((order: any, index: number) => (
          <tr key={index} className="hover:bg-gray-100 dark:hover:bg-neutral-800/30 border-b border-gray-100 dark:border-neutral-800/50">
            <td className="px-4 py-2 truncate text-gray-600 dark:text-neutral-300">
              {new Date(order.time).toLocaleString()}
            </td>
            <td className={`px-4 text-xs py-2 font-medium truncate ${order.type === "buy" ? "text-green-600 dark:text-green-500 uppercase" : "text-red-600 dark:text-red-500 uppercase"}`}>
              {order.type}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              ${formatPrice(order.priceUsd)}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              {formatNumberWithSuffix(order.amount)}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              ${(order.priceUsd * order.amount).toFixed(6)}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              {order.program}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              {order.tx}
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium truncate">
              COMPLETED
            </td>
            <td className="px-4 text-gray-600 dark:text-neutral-300 text-xs py-2 font-medium flex items-center truncate">
              {truncateString(order.wallet, 10)}
              <button className="ml-1 text-gray-400 hover:text-gray-600 dark:text-neutral-500 dark:hover:text-neutral-300">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="box-shadow-info rounded-xl p-3 overflow-hidden bg-white dark:bg-neutral-1000 flex flex-col h-full">
      <div className="flex border-gray-200 dark:border-neutral-800 h-[30px] bg-gray-100 dark:bg-theme-neutral-1000 rounded-xl">
        <button 
          className={`flex-1 rounded-xl text-sm cursor-pointer font-medium uppercase text-center ${activeTab === "all" ? "bg-blue-500 text-white dark:linear-gradient-connect" : "text-gray-500 dark:text-neutral-400"}`}
          onClick={() => setActiveTab("all")}
        >
          ALL TRANSACTIONS
        </button>
        <button
          className={`flex-1 rounded-xl cursor-pointer text-sm font-medium uppercase text-center ${activeTab === "my" ? "bg-blue-500 text-white dark:linear-gradient-connect" : "text-gray-500 dark:text-neutral-400"}`}
          onClick={() => setActiveTab("my")}
        >
          MY TRANSACTIONS
        </button>
      </div>

      <div className="mt-3 bg-gray-50 dark:bg-[#0F0F0F] rounded-xl relative flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-auto">
          {activeTab === "all" ? renderAllTransactionsTable() : renderMyTransactionsTable()}
        </div>
      </div>
    </div>
  )
}
