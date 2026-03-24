//+------------------------------------------------------------------+
//|                                                   MonitorEA.mq4  |
//|                          MT4 Account Monitor - File-Based Push   |
//|        Writes account data to a JSON file for backend to read    |
//+------------------------------------------------------------------+
#property copyright "MT4 Monitor"
#property version   "2.00"
#property strict

//--- Input parameters
input int      IntervalSec = 10;        // Update interval in seconds
input int      HistoryDays = 30;        // Days of trade history to send

//--- Global vars
string g_filename;

//+------------------------------------------------------------------+
int OnInit()
{
   g_filename = "monitor_" + IntegerToString(AccountNumber()) + ".json";
   EventSetTimer(IntervalSec);
   Print("MonitorEA v2 initialized. File: ", g_filename,
         " | Interval: ", IntervalSec, "s");

   // Write immediately
   WriteData();
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("MonitorEA stopped.");
}

//+------------------------------------------------------------------+
void OnTimer()
{
   WriteData();
}

//+------------------------------------------------------------------+
void WriteData()
{
   string json = BuildJSON();

   int handle = FileOpen(g_filename, FILE_WRITE|FILE_TXT|FILE_ANSI|FILE_COMMON);
   if(handle == INVALID_HANDLE)
   {
      Print("MonitorEA ERROR: Cannot open file ", g_filename, " error=", GetLastError());
      return;
   }

   FileWriteString(handle, json);
   FileClose(handle);
}

//+------------------------------------------------------------------+
string BuildJSON()
{
   string json = "{";

   // Account info
   json += "\"account_info\":{";
   json += "\"login\":" + IntegerToString(AccountNumber()) + ",";
   json += "\"server\":\"" + EscapeJSON(AccountServer()) + "\",";
   json += "\"balance\":" + DoubleToString(AccountBalance(), 2) + ",";
   json += "\"equity\":" + DoubleToString(AccountEquity(), 2) + ",";
   json += "\"margin\":" + DoubleToString(AccountMargin(), 2) + ",";
   json += "\"margin_free\":" + DoubleToString(AccountFreeMargin(), 2) + ",";
   json += "\"margin_level\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL), 2) + ",";
   json += "\"currency\":\"" + AccountCurrency() + "\",";
   json += "\"leverage\":" + IntegerToString(AccountLeverage());
   json += "},";

   // Open positions
   json += "\"positions\":[";
   bool firstPos = true;
   for(int i = 0; i < OrdersTotal(); i++)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderType() > OP_SELL) continue; // Skip pending orders

      if(!firstPos) json += ",";
      firstPos = false;

      json += "{";
      json += "\"ticket\":" + IntegerToString(OrderTicket()) + ",";
      json += "\"symbol\":\"" + OrderSymbol() + "\",";
      json += "\"type\":" + IntegerToString(OrderType()) + ",";
      json += "\"volume\":" + DoubleToString(OrderLots(), 2) + ",";

      int digits = (int)MarketInfo(OrderSymbol(), MODE_DIGITS);
      json += "\"price_open\":" + DoubleToString(OrderOpenPrice(), digits) + ",";
      json += "\"price_current\":" + DoubleToString(OrderClosePrice(), digits) + ",";
      json += "\"sl\":" + DoubleToString(OrderStopLoss(), digits) + ",";
      json += "\"tp\":" + DoubleToString(OrderTakeProfit(), digits) + ",";
      json += "\"profit\":" + DoubleToString(OrderProfit() + OrderSwap() + OrderCommission(), 2) + ",";
      json += "\"time\":\"" + TimeToStr(OrderOpenTime(), TIME_DATE|TIME_SECONDS) + "\"";
      json += "}";
   }
   json += "],";

   // Closed trades (last N days)
   json += "\"closed_trades\":[";
   bool firstTrade = true;
   datetime fromDate = TimeCurrent() - HistoryDays * 86400;

   for(int i = OrdersHistoryTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if(OrderType() > OP_SELL) continue;
      if(OrderCloseTime() < fromDate) continue;

      if(!firstTrade) json += ",";
      firstTrade = false;

      json += "{";
      json += "\"ticket\":" + IntegerToString(OrderTicket()) + ",";
      json += "\"symbol\":\"" + OrderSymbol() + "\",";
      json += "\"type\":" + IntegerToString(OrderType()) + ",";
      json += "\"volume\":" + DoubleToString(OrderLots(), 2) + ",";
      json += "\"profit\":" + DoubleToString(OrderProfit() + OrderSwap() + OrderCommission(), 2) + ",";
      json += "\"entry\":1,";
      json += "\"time\":\"" + TimeToStr(OrderCloseTime(), TIME_DATE|TIME_SECONDS) + "\"";
      json += "}";
   }
   json += "],";

   // Timestamp
   json += "\"timestamp\":\"" + TimeToStr(TimeCurrent(), TIME_DATE|TIME_SECONDS) + "\"";

   json += "}";
   return json;
}

//+------------------------------------------------------------------+
string EscapeJSON(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}
//+------------------------------------------------------------------+
