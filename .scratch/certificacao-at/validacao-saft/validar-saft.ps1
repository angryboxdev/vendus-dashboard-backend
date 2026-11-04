# Validação estrutural de um SAF-T contra o XSD oficial 1.04_01, convertido para XSD 1.0
# (o .NET não suporta XSD 1.1): retira os xs:assert (regras cobertas nos testes do gerador)
# e troca xs:all por xs:sequence (mais exigente: obriga à ordem documentada).
# Uso: powershell -File validar-saft.ps1 <xsd-oficial> <ficheiro-saft.xml>
param([string]$Xsd, [string]$Xml)
$enc = [System.Text.Encoding]::GetEncoding(1252)
$schema = [System.IO.File]::ReadAllText($Xsd, $enc)
$schema = [regex]::Replace($schema, '<xs:assert[\s\S]*?/>', '')
$schema = $schema.Replace('<xs:all>', '<xs:sequence>').Replace('</xs:all>', '</xs:sequence>')
$tmp = Join-Path $env:TEMP "saft-1.04_01-xsd10.xsd"
[System.IO.File]::WriteAllText($tmp, $schema, $enc)
$set = New-Object System.Xml.Schema.XmlSchemaSet
$null = $set.Add("urn:OECD:StandardAuditFile-Tax:PT_1.04_01", $tmp)
$settings = New-Object System.Xml.XmlReaderSettings
$settings.ValidationType = [System.Xml.ValidationType]::Schema
$settings.Schemas = $set
$errors = New-Object System.Collections.ArrayList
$settings.add_ValidationEventHandler({ param($s, $e) [void]$errors.Add("$($e.Exception.LineNumber):$($e.Exception.LinePosition) $($e.Message)") })
$reader = [System.Xml.XmlReader]::Create($Xml, $settings)
while ($reader.Read()) {}
$reader.Close()
"erros: $($errors.Count)"
$errors | Select-Object -First 10
