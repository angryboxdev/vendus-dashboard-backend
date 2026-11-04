# Valida mensagens (corpo SOAP) contra o esquema embutido num WSDL da AT (XSD 1.0).
# Uso: powershell -File validar-wsdl.ps1 -Wsdl <...>\Fatcorews.wsdl -Xml a.xml,b.xml
param([Parameter(Mandatory)][string]$Wsdl, [Parameter(Mandatory)][string[]]$Xml)
$doc = New-Object System.Xml.XmlDocument
$doc.Load($Wsdl)
$ns = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
$ns.AddNamespace("xs", "http://www.w3.org/2001/XMLSchema")
$schemaNode = $doc.SelectSingleNode("//xs:schema", $ns)
$set = New-Object System.Xml.Schema.XmlSchemaSet
$reader = New-Object System.Xml.XmlNodeReader($schemaNode)
[void]$set.Add([System.Xml.Schema.XmlSchema]::Read($reader, $null))
$set.Compile()
$total = 0
foreach ($file in $Xml) {
  $errors = New-Object System.Collections.ArrayList
  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.ValidationType = [System.Xml.ValidationType]::Schema
  $settings.Schemas = $set
  $settings.add_ValidationEventHandler({ param($s, $e) [void]$errors.Add("linha $($e.Exception.LineNumber): $($e.Message)") })
  $r = [System.Xml.XmlReader]::Create($file, $settings)
  while ($r.Read()) {}
  $r.Close()
  Write-Output "$(Split-Path $file -Leaf): $($errors.Count) erros"
  $errors | ForEach-Object { Write-Output "  $_" }
  $total += $errors.Count
}
exit $total
