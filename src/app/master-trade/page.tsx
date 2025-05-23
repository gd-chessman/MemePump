"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { Search, Copy, ChevronDown, Crown, Loader2 } from "lucide-react"
import { getMasterById, getMasters } from "@/services/api/MasterTradingService"
import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { MasterTradingService } from "@/services/api"
import ConnectToMasterModal from "../components/connect-master-trade-modal"
import { truncateString } from "@/utils/format"
import DetailMasterModal from "./modal-detail-wallet"

// Định nghĩa các kiểu dữ liệu
type TradeStatus = "Not Connected" | "connect" | "disconnect" | "pause" | "pending" | "block"
type TradeType = "VIP" | "NORMAL"

interface TradeData {
    id: number
    address: string
    pnl7d: number | string
    pnlPercent7d: number | string
    pnl30d: number | string
    pnlPercent30d: number | string
    winRate7d: number | string
    transactions7d: {
        wins: number;
        losses: number;
    }
    lastTime: string
    type: TradeType
    status: TradeStatus
}

interface Trader {
    id?: string;
    solana_address?: string;
    eth_address?: string;
    pnl7d?: number;
    pnlPercent7d?: number;
    pnl30d?: number;
    pnlPercent30d?: number;
    winRate7d?: number;
    transactions7d?: {
        wins: number;
        losses: number;
    };
    lastTime?: string;
    type?: string;
    connection_status?: TradeStatus;
}

interface MasterDetail {
    "1d": {
        totalPnL: number;
        totalChange: number;
        percentageChange: number;
        winPercentage: number;
        wins: number;
        losses: number;
    };
    "7d": {
        totalPnL: number;
        totalChange: number;
        percentageChange: number;
        winPercentage: number;
        wins: number;
        losses: number;
    };
    "30d": {
        totalPnL: number;
        totalChange: number;
        percentageChange: number;
        winPercentage: number;
        wins: number;
        losses: number;
    };
    address: string;
    lastTime?: string;
    status?: TradeStatus;
    id?: string;
}

// Định nghĩa các kiểu lọc
type FilterType = "All" | "Not Connected" | "connect" | "disconnect" | "pause" | "pending"
const styleTextRow = "px-4 py-2 rounded-md text-xs"
const greenBg = "text-theme-green-200 border border-theme-green-200"
const redBg = "text-theme-red-200 border border-theme-red-200"
const yellowBg = "text-theme-yellow-200 border border-theme-yellow-200"
const blueBg = "text-theme-blue-200 border border-theme-blue-200"
const textHeaderTable = "text-xs font-normal text-neutral-200"

export default function MasterTradeTable() {
    const [activeFilter, setActiveFilter] = useState<FilterType>("All")
    const [searchQuery, setSearchQuery] = useState("")
    const [showConnectModal, setShowConnectModal] = useState<string>("")
    const [inforWallet, setInforWallet] = useState<any>(null)
    const [showDetailModal, setShowDetailModal] = useState<boolean>(false)
    const [selectedAddress, setSelectedAddress] = useState<string>("")
    const [copyNotification, setCopyNotification] = useState<{ show: boolean; address: string }>({ show: false, address: "" })
    const [combinedMasterData, setCombinedMasterData] = useState<(Trader & MasterDetail)[]>([])
    const router = useRouter()

    const roundToTwoDecimals = (value: number | undefined | null): number | string => {
        if (value === undefined || value === null) return "updating";
        // Multiply by 100, round up, then divide by 100 to get 2 decimal places
        return Math.ceil(value * 100) / 100;
    };

    const formatLastTime = (timestamp: string | undefined | null): string => {
        if (!timestamp) return "updating";
        try {
            const date = new Date(timestamp);
            const now = new Date();
            const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

            if (diffInSeconds < 60) {
                return `${diffInSeconds} seconds ago`;
            }

            const diffInMinutes = Math.floor(diffInSeconds / 60);
            if (diffInMinutes < 60) {
                return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
            }

            const diffInHours = Math.floor(diffInMinutes / 60);
            if (diffInHours < 24) {
                return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
            }

            const diffInDays = Math.floor(diffInHours / 24);
            if (diffInDays < 7) {
                return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
            }

            const diffInWeeks = Math.floor(diffInDays / 7);
            if (diffInWeeks < 4) {
                return `${diffInWeeks} ${diffInWeeks === 1 ? 'week' : 'weeks'} ago`;
            }

            const diffInMonths = Math.floor(diffInDays / 30);
            if (diffInMonths < 12) {
                return `${diffInMonths} ${diffInMonths === 1 ? 'month' : 'months'} ago`;
            }

            const diffInYears = Math.floor(diffInDays / 365);
            return `${diffInYears} ${diffInYears === 1 ? 'year' : 'years'} ago`;
        } catch (error) {
            return "updating";
        }
    };

    const { data: masterTraders = [], refetch: refetchMasterTraders, isLoading: isLoadingMasters } = useQuery({
        queryKey: ["master-trading/masters"],
        queryFn: getMasters,
    });

    const { data: masterDetails = [] } = useQuery({
        queryKey: ["master-trading/details", masterTraders.map((t: Trader) => t.solana_address || t.eth_address)],
        queryFn: async () => {
            const details = await Promise.all(
                masterTraders.map(async (trader: Trader) => {
                    const address = trader.solana_address || trader.eth_address;
                    const status = trader.connection_status;
                    if (!address) return null;
                    try {
                        const data = await getMasterById(address);
                        return { ...data.historic.summary, address, lastTime: data?.pnl_since };
                    } catch (error) {
                        console.error(`Error fetching details for ${address}:`, error);
                        return null;
                    }
                })
            );
            return details;
        },
        enabled: masterTraders.length > 0,
    });
   
    // Combine masterTraders and masterDetails data
    useEffect(() => {
        if (masterTraders.length > 0 && masterDetails.length > 0) {
            const combined = masterTraders.map((trader: Trader) => {
                const traderAddress = trader.solana_address || trader.eth_address;
                const details = masterDetails.find((detail: MasterDetail) => detail.address === traderAddress);
                
                if (details) {
                    return {
                        ...trader,
                        ...details,
                        // Ensure we keep the connection_status from trader
                        connection_status: trader.connection_status,
                    };
                }
                return trader;
            }).filter(Boolean); // Remove any null entries

            setCombinedMasterData(combined);
        }
    }, [masterTraders, masterDetails]);

    // Update tradeData to use combinedMasterData instead of masterDetails
    const tradeData = useMemo(() => {
        return combinedMasterData.map((trader) => {
            return {
                id: trader.id,
                address: trader.address,
                pnl7d: roundToTwoDecimals(trader["7d"]?.totalChange),
                pnlPercent7d: roundToTwoDecimals(trader["7d"]?.percentageChange),
                pnl30d: roundToTwoDecimals(trader["30d"]?.totalChange),
                pnlPercent30d: roundToTwoDecimals(trader["30d"]?.percentageChange),
                winRate7d: roundToTwoDecimals(trader["7d"]?.winPercentage),
                transactions7d: {
                    wins: trader["7d"]?.wins ?? 0,
                    losses: trader["7d"]?.losses ?? 0
                },
                lastTime: formatLastTime(trader.lastTime),
                type: trader.type || "NORMAL" as TradeType,
                status: (trader.connection_status ?? "Not Connected") as TradeStatus
            };
        });
    }, [combinedMasterData]);

    // Đếm số lượng mục theo trạng thái
    const connectedCount = tradeData.filter((item) => item.status === "connect").length
    const notConnectedCount = tradeData.filter((item) => item.status === "Not Connected").length
    const disconnectedCount = tradeData.filter((item) => item.status === "disconnect").length
    const pendingCount = tradeData.filter((item) => item.status === "pending").length
    const pausedCount = tradeData.filter((item) => item.status === "pause").length

    // Lọc dữ liệu dựa trên bộ lọc đang hoạt động và truy vấn tìm kiếm
    const filteredData = useMemo(() => {
        let filtered = tradeData;

        // Áp dụng bộ lọc trạng thái
        if (activeFilter !== "All") {
            filtered = filtered.filter((item) => item.status === activeFilter);
        }

        // Áp dụng tìm kiếm
        if (searchQuery) {
            const searchLower = searchQuery.toLowerCase().trim();
            filtered = filtered.filter((item) => {
                const fullAddress = item.address.toLowerCase();
                const truncatedAddress = truncateString(item.address, 12).toLowerCase();
                return fullAddress.includes(searchLower) || truncatedAddress.includes(searchLower);
            });
        }

        return filtered;
    }, [tradeData, activeFilter, searchQuery]);
    console.log("filteredData", filteredData)

    // Xử lý sao chép địa chỉ
    const copyAddress = (address: string) => {
        navigator.clipboard.writeText(address)
        setCopyNotification({ show: true, address })
        // Tự động ẩn thông báo sau 2 giây
        setTimeout(() => {
            setCopyNotification({ show: false, address: "" })
        }, 2000)
    }

    // Xử lý các hành động
    const handleConnect = (address: string, type?: string, inforWallet?: any) => {

        if (type === "NORMAL") {
            setShowConnectModal(address)
        } else {
            handleMemberConnect(inforWallet)
        }
        // Thực hiện logic kết nối ở đây
    }
    const handleMemberConnect = async (inforWallet?: any, status?: string) => {
        console.log("inforWallet dddddd", inforWallet)
        await MasterTradingService.memberSetConnect({
            master_id: inforWallet.id,
            status: status,
            master_address: inforWallet.address,
        });
        refetchMasterTraders()
    }

    const handleDisconnect = (id: string) => {
        console.log(`Disconnecting from ${id}`)
        // Thực hiện logic ngắt kết nối ở đây
    }

    const handlePause = (id: string) => {
        console.log(`Pausing ${id}`)
        // Thực hiện logic tạm dừng ở đây
    }

    const handleReconnect = (id: string) => {
        console.log(`Reconnecting to ${id}`)
        // Thực hiện logic kết nối lại ở đây
    }

    const handleCancel = (id: string) => {
        console.log(`Cancelling ${id}`)
        // Thực hiện logic hủy ở đây
    }

    // Loading skeleton component
    const TableSkeleton = () => (
        <tr className="border-b border-blue-500/10 animate-pulse">
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-32"></div>
            </td>
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-20"></div>
            </td>
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-20"></div>
            </td>
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-16"></div>
            </td>
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-12"></div>
            </td>
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-24"></div>
            </td>
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-16"></div>
            </td>
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-24"></div>
            </td>
            <td className={`${styleTextRow}`}>
                <div className="h-4 bg-gray-700 rounded w-24"></div>
            </td>
        </tr>
    );

    // Helper function to get trader details
    const getTraderDetails = (address: string) => {
        return combinedMasterData.find((t: (Trader & MasterDetail)) => t.address === address);
    };

    const getValueColor = (value: number | string): string => {
        if (typeof value === 'string') {
            // Handle "updating" case
            if (value === "updating") return 'text-neutral-200';
            // Convert string to number
            const numValue = Number(value);
            if (isNaN(numValue)) return 'text-neutral-200';
            // Use a small epsilon to handle floating point comparison
            if (numValue > 0.0001) return 'text-theme-green-200';
            if (numValue < -0.0001) return 'text-theme-red-200';
            return 'text-neutral-200';
        }
        // For number type
        if (value > 0.0001) return 'text-theme-green-200';
        if (value < -0.0001) return 'text-theme-red-200';
        return 'text-neutral-200';
    };

    return (
        <div className="container-body h-[92vh] px-[40px] flex flex-col gap-6 pt-[30px] relative mx-auto z-10">
            {/* Thông báo copy */}
            {copyNotification.show && (
                <div className="fixed top-4 right-4 bg-theme-green-200 text-black px-4 py-2 rounded-lg shadow-lg transition-opacity duration-300 animate-fade-in-out">
                    Copied address: {copyNotification.address}
                </div>
            )}

            {/* Bộ lọc và Tìm kiếm */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex flex-wrap gap-6">
                    <button
                        onClick={() => setActiveFilter("All")}
                        className={`rounded-sm text-sm font-medium text-neutral-400 px-2 py-1 border-1 z-10 border-solid border-theme-primary-300 cursor-pointer ${activeFilter === "All" ? 'bg-[#0F0F0F]' : 'border-transparent'}`}
                    >
                        <span className={`${activeFilter === 'All' ? 'gradient-hover' : ''}`}>All master trade ({tradeData.length})</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("Not Connected")}
                        className={`rounded-sm text-sm font-medium text-neutral-400 px-2 py-1 border-1 z-10 border-solid border-theme-primary-300 cursor-pointer ${activeFilter === "Not Connected" ? 'bg-[#0F0F0F]' : 'border-transparent'}`}
                    >
                        <span className={`${activeFilter === 'Not Connected' ? 'gradient-hover' : ''}`}>Not connected ({notConnectedCount})</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("connect")}
                        className={`rounded-sm text-sm font-medium text-neutral-400 px-2 py-1 border-1 z-10 border-solid border-theme-primary-300 cursor-pointer ${activeFilter === "connect" ? 'bg-[#0F0F0F]' : 'border-transparent'}`}
                    >
                        <span className={`${activeFilter === 'connect' ? 'gradient-hover' : ''}`}>Connected ({connectedCount})</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("disconnect")}
                        className={`rounded-sm text-sm font-medium text-neutral-400 px-2 py-1 border-1 z-10 border-solid border-theme-primary-300 cursor-pointer ${activeFilter === "disconnect" ? 'bg-[#0F0F0F]' : 'border-transparent'}`}
                    >
                        <span className={`${activeFilter === 'disconnect' ? 'gradient-hover' : ''}`}>Disconnected ({disconnectedCount})</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("pause")}
                        className={`rounded-sm text-sm font-medium text-neutral-400 px-2 py-1 border-1 z-10 border-solid border-theme-primary-300 cursor-pointer ${activeFilter === "pause" ? 'bg-[#0F0F0F]' : 'border-transparent'}`}
                    >
                        <span className={`${activeFilter === 'pause' ? 'gradient-hover' : ''}`}>Paused ({pausedCount})</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter("pending")}
                        className={`rounded-sm text-sm font-medium text-neutral-400 px-2 py-1 border-1 z-10 border-solid border-theme-primary-300 cursor-pointer ${activeFilter === "pending" ? 'bg-[#0F0F0F]' : 'border-transparent'}`}
                    >
                        <span className={`${activeFilter === 'pending' ? 'gradient-hover' : ''}`}>Pending ({pendingCount})</span>
                    </button>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by wallet address..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="rounded-full py-2 pl-10 pr-4 w-64 text-sm focus:outline-none bg-gray-100 dark:bg-black text-gray-900 dark:text-neutral-200 focus:ring-1 focus:ring-blue-500 dark:focus:ring-[hsl(var(--ring))] max-h-[30px] border border-gray-200 dark:border-t-theme-primary-300 dark:border-l-theme-primary-300 dark:border-b-theme-secondary-400 dark:border-r-theme-secondary-400 placeholder:text-gray-500 dark:placeholder:text-neutral-400 placeholder:text-xs"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            >
                                ×
                            </button>
                        )}
                    </div>

                    {masterTraders.length > 0 && (
                        <button className="w-full max-w-[400px] create-coin-bg hover:linear-200-bg hover-bg-delay dark:text-neutral-100 font-medium px-4 py-[6px] rounded-full transition-all duration-500 ease-in-out disabled:opacity-70 disabled:cursor-not-allowed mx-auto flex gap-2 text-xs" onClick={() => router.push("/master-trade/manage")}>
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                            Manage Master
                        </button>
                    )}
                </div>
            </div>

            {/* Bảng dữ liệu */}
            <div className="overflow-x-auto rounded-xl border-1 z-10 border-solid border-y-[#15DFFD] border-x-[#720881] bg-theme-black-1/2 bg-opacity-30 backdrop-blur-sm">
                <table className="w-full text-neutral-100">
                    <thead>
                        <tr className="border-b border-blue-500/30 text-gray-400 text-sm">
                            <th className={`${styleTextRow} text-left ${textHeaderTable} w-[15%]`}>Address</th>
                            <th className={`${styleTextRow} text-center ${textHeaderTable} w-[12%]`}>
                                <div className={`flex items-center justify-center ${textHeaderTable}`}>
                                    7D PnL
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                </div>
                            </th>
                            <th className={`${styleTextRow} text-center w-[12%]`}>
                                <div className={`flex items-center justify-center ${textHeaderTable}`}>
                                    30D PnL
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                </div>
                            </th>
                            <th className={`${styleTextRow} text-center w-[10%]`}>
                                <div className={`flex items-center justify-center ${textHeaderTable}`}>
                                    7D Win Rate
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                </div>
                            </th>
                            <th className={`${styleTextRow} text-left w-[8%]`}>
                                <div className={`flex items-center ${textHeaderTable}`}>
                                    7D TXs
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                </div>
                            </th>
                            <th className={`${styleTextRow} text-left w-[10%]`}>
                                <div className={`flex items-center ${textHeaderTable}`}>
                                    Last Time
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                </div>
                            </th>
                            <th className={`${styleTextRow} text-left w-[8%]`}>
                                <div className={`flex items-center ${textHeaderTable}`}>
                                    Type
                                    <ChevronDown className="ml-1 h-4 w-4" />
                                </div>
                            </th>
                            <th className={`${styleTextRow} text-start ${textHeaderTable} w-[8%]`}>Status</th>
                            <th className={`${styleTextRow} text-start ${textHeaderTable} whitespace-nowrap`}>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoadingMasters ? (
                            // Show 5 skeleton rows while loading
                            Array(5).fill(0).map((_, index) => (
                                <TableSkeleton key={index} />
                            ))
                        ) : filteredData.length === 0 ? (
                            <tr>
                                <td colSpan={9} className="text-center py-8 text-neutral-400">
                                    No data available
                                </td>
                            </tr>
                        ) : (
                            filteredData.map((item) => (
                                <tr key={item.id} className="border-b border-blue-500/10 hover:bg-blue-900/10 transition-colors">
                                    <td className={`${styleTextRow}`}>
                                        <div className="flex items-center text-xs font-normal text-neutral-200">
                                            <span className="text-neutral-100 text-xs font-medium">{truncateString(item.address, 12)}</span>
                                            <button
                                                onClick={() => copyAddress(item.address)}
                                                className="ml-2 text-neutral-100 transition-colors group relative"
                                            >
                                                <Copy className="h-4 w-4" />
                                                <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-800 text-neutral-100 text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap">
                                                    Copy address
                                                </span>
                                            </button>
                                        </div>
                                    </td>
                                    <td className={`${styleTextRow} text-center`}>
                                        <div className={`text-xs ${getValueColor(Number(item.pnlPercent7d))}`}>{item.pnlPercent7d} %</div>
                                        <div className={`text-xs ${getValueColor(Number(item.pnl7d))}`}>${item.pnl7d}</div>
                                    </td>
                                    <td className={`${styleTextRow} text-center`}>
                                        <div className={`text-xs ${getValueColor(Number(item.pnlPercent30d))}`}>{item.pnlPercent30d} %</div>
                                        <div className={`text-xs ${getValueColor(Number(item.pnl30d))}`}>${item.pnl30d}</div>
                                    </td>
                                    <td className={`${styleTextRow} text-center`}>
                                        <div className={`${getValueColor(Number(item.winRate7d))}`}>{item.winRate7d}%</div>
                                    </td>
                                    <td className={`${styleTextRow} text-xs flex flex-col gap-1`}>
                                        <div>
                                            <span className="text-xs">{item.transactions7d.wins + item.transactions7d.losses}</span>
                                        </div>
                                        <div className="flex gap-1">
                                            <div className="text-theme-green-200 text-xs">{item.transactions7d.wins}</div>
                                            <div className="text-theme-red-200 text-xs">{item.transactions7d.losses}</div>
                                        </div>
                                        {/* <div className="text-theme-primary-400">3/4</div> */}
                                    </td>
                                    <td className={`${styleTextRow} text-xs`}>{item.lastTime}</td>
                                    <td className={`${styleTextRow}`}>
                                        {item.type === "VIP" ? (
                                            <div className="flex items-center text-theme-yellow-200 text-xs">
                                                <Crown className="h-4 w-4 mr-1" />
                                                VIP
                                            </div>
                                        ) : (
                                            <div className="text-theme-primary-400 text-xs">NORMAL</div>
                                        )}
                                    </td>
                                    <td className={`${styleTextRow} text-start`}>
                                        <span
                                            className={` py-1 rounded-full text-xs`}
                                        >
                                            {item.status}
                                        </span>
                                    </td>
                                    <td className={`${styleTextRow} text-center`}>
                                        <div className="flex  gap-1 justify-start">
                                            {item.status === "Not Connected" && (
                                                <button
                                                    onClick={() => {
                                                        handleConnect(item.address, item.type, item)
                                                        setInforWallet(getTraderDetails(item.address))
                                                    }}
                                                    className={`px-3 py-1 text-theme-green-200 border border-theme-green-200 hover:text-neutral-100 hover:bg-theme-green-200 rounded-full transition-colors text-xs`}
                                                >
                                                    Connect
                                                </button>
                                            )}
                                            {item.status === "connect" && (
                                                <>
                                                    <button
                                                        onClick={() => {
                                                            handlePause(item.address)
                                                            setInforWallet(getTraderDetails(item.address))
                                                        }}
                                                        className={`px-3 py-1 ${blueBg} rounded-full transition-colors text-xs`}
                                                    >
                                                        Chat
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setShowDetailModal(true)
                                                            setSelectedAddress(item.address)
                                                        }}
                                                        className={`px-3 py-1 ${blueBg} rounded-full transition-colors text-xs`}
                                                    >
                                                        Details
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            handleMemberConnect(item, "pause")
                                                        }}
                                                        className={`px-3 py-1 text-theme-yellow-200 border border-theme-yellow-200 hover:text-neutral-100 hover:bg-theme-yellow-200 rounded-full transition-colors text-xs`}
                                                    >
                                                        Pause
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            handleMemberConnect(item, "disconnect")
                                                        }}
                                                        className={`px-3 py-1 text-theme-red-200 border border-theme-red-200 hover:text-neutral-100 hover:bg-theme-red-200 rounded-full transition-colors text-xs`}
                                                    >
                                                        Disconnect
                                                    </button>
                                                </>
                                            )}
                                            {(item.status === "disconnect" || item.status === "pause") && (
                                                <button
                                                    onClick={() => {
                                                        handleMemberConnect(item, "connect")
                                                    }}
                                                    className={`px-3 py-1 text-theme-green-200 border border-theme-green-200 hover:text-neutral-100 hover:bg-theme-green-200 rounded-full transition-colors text-xs`}
                                                >
                                                    Reconnect
                                                </button>
                                            )}

                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
                {isLoadingMasters && (
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-theme-primary-300" />
                            <span className="text-sm text-neutral-200">Loading...</span>
                        </div>
                    </div>
                )}
            </div>
            <ConnectToMasterModal
                refetchMasterTraders={refetchMasterTraders}
                inforWallet={inforWallet}
                onClose={() => setShowConnectModal("")}
                masterAddress={showConnectModal}
                isMember={true}
                onConnect={handleConnect}
            />
            <DetailMasterModal
                isOpen={showDetailModal}
                onClose={() => setShowDetailModal(false)}
                address={selectedAddress}
            />
        </div>
    )
}
